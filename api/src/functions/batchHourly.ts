import { app, InvocationContext, Timer } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doCompleteMatch } from "../services/doCompleteMatch";
import { doFindDueMatches, MatchDeadlineState } from "../services/doFindDueMatches";
import { doSendPush } from "../services/doSendPush";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const WARNING_HOURS = 12;

// Forfeits, on behalf of the defender, matches that missed their deadline: pending matches never accepted
// within cool_period, active matches never played within play_period. Both players are notified.
// Returns true when the public graph changed.
async function forfeitOverdueMatches(context: InvocationContext, state: MatchDeadlineState): Promise<boolean> {

    let forfeited = 0;

    for (const { matchId, name, defenderId } of await doFindDueMatches(state)) {
        context.log(`Batch: forfeiting overdue ${state} match ${matchId} (${name}) on behalf of defender ${defenderId}`);

        const result = await doCompleteMatch(
            { matchId, forfeiterId: defenderId, content: `Time violation, ${state} match forfeited` },
            context
        );

        if (result.ok) forfeited++;
        else context.warn(`Could not forfeit ${matchId}: ${result.message}`);
    }

    context.log(`Batch: overdue ${state} matches forfeited: ${forfeited}`);

    return forfeited > 0;
}

// Warns both players once, in the hourly run that falls 12 hours before their match will be forfeited
async function warnDueMatches(context: InvocationContext, state: MatchDeadlineState): Promise<void> {

    const due = await doFindDueMatches(state, {
        afterMs: (WARNING_HOURS - 1) * HOUR_MS,
        withinMs: WARNING_HOURS * HOUR_MS
    });

    for (const { matchId, name, challengerId, defenderId } of due) {
        context.log(`Batch: warning about ${state} match ${matchId} (${name}) due within ${WARNING_HOURS} hours`);

        await doSendPush({
            userIds: [challengerId, defenderId],
            heading: name,
            content: `Time violation warning, ${state} match will be forfeited`,
            path: `match/${matchId}`,
            collapseId: `${matchId}_warning`
        }, context);
    }

    context.log(`Batch: ${state} match warnings: ${due.length}`);
}

// Returns cooling players to active once the ladder's cool_period (days) has passed since they began cooling.
// A relation row's storage timestamp is when it was last written, which is when the player started cooling.
// Returns true when the public graph changed.
async function releaseCoolingPlayers(context: InvocationContext): Promise<boolean> {

    let released = 0;

    for await (const ladder of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${"ladder"}` }
    })) {
        const ladderId = ladder.rowKey as string;
        const coolMs = Number(ladder.cool_period ?? 2) * DAY_MS;

        for await (const relation of guidsClient.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
        })) {
            if (relation.is_participant !== true || relation.state !== "cooling") continue;

            const since = Date.parse(String(relation.timestamp));

            if (Number.isNaN(since) || Date.now() - since < coolMs) continue;

            const { partitionKey, rowKey, timestamp, etag, ...attributes } = relation;

            context.log(`Batch: releasing ${rowKey} from cooling on ladder ${ladderId}`);

            await doUpsertRelation(ladderId, rowKey as string, { ...attributes, state: "active" });
            released++;
        }
    }

    context.log(`Batch: cooling players released: ${released}`);

    return released > 0;
}

// Hourly batch. Forfeits run first so a defender who has just lost starts cooling from this run.
export async function batchHourly(_timer: Timer, context: InvocationContext): Promise<void> {

    const changed = [
        await forfeitOverdueMatches(context, "pending"),
        await forfeitOverdueMatches(context, "active"),
        await releaseCoolingPlayers(context)
    ];

    await warnDueMatches(context, "pending");
    await warnDueMatches(context, "active");

    if (changed.some(Boolean)) await doGuidsToPublic();
}

app.timer("batchHourly", {
    schedule: "0 0 * * * *",
    handler: batchHourly
});
