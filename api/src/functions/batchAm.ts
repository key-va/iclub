import { app, InvocationContext, Timer } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

const DAY_MS = 86400000;

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

            await doUpsertRelation(ladderId, rowKey as string, { ...attributes, state: "active" });
            released++;
        }
    }

    context.log(`Cooling check released ${released} player(s)`);

    return released > 0;
}

// Nightly batch: add further morning jobs here and republish once if any of them changed the graph
export async function batchAm(_timer: Timer, context: InvocationContext): Promise<void> {

    const sydneyHour = Number(
        new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }).format(new Date())
    ) % 24;

    if (sydneyHour !== 2) return;

    const changed = [await releaseCoolingPlayers(context)];

    if (changed.some(Boolean)) await doGuidsToPublic();
}

// Runs hourly but only acts at 2am Sydney time, so no WEBSITE_TIME_ZONE setting is needed and daylight saving is handled
app.timer("batchAm", {
    schedule: "0 0 * * * *",
    handler: batchAm
});
