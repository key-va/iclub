import { doCompetitorUsers } from "../services/doCompetitorUsers";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, TransactionAction, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doSendPush } from "../services/doSendPush";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

async function getRow(pk: string, rk: string): Promise<Record<string, unknown> | undefined> {
    try {
        return await guidsClient.getEntity(pk, rk);
    } catch (err: any) {
        if (err?.statusCode === 404) return undefined;
        throw err;
    }
}

const playerName = (name: unknown) => String(name ?? "").trim() || "Player";

function ongoingMatch(challenger: Record<string, unknown> | undefined, defender: Record<string, unknown> | undefined, isChallenger: boolean) {
    const message = challenger?.state === "busy" ? (isChallenger ? "You already have an ongoing match" : "The challenger already has an ongoing match")
        : defender?.state === "busy" ? "The opponent already has an ongoing match" : undefined;
    return message ? { status: 409, jsonBody: { success: false, message } } : undefined;
}

export async function matchCreate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: { ladder_id?: string; challenger_id?: string; defender_id?: string };
    };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const { caller_id, device_id, signature, data } = body ?? {};
    const ladderId = data?.ladder_id;
    const challengerId = data?.challenger_id;
    const defenderId = data?.defender_id;

    if (typeof caller_id !== "string" || !caller_id || (!device_id && !caller_id.startsWith("bot_")) || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id and signature are required; user callers also require device_id" } };
    }

    if (typeof ladderId !== "string" || !ladderId.startsWith("ladder_")) {
        return { status: 400, jsonBody: { success: false, message: "ladder_id is required" } };
    }

    if (typeof challengerId !== "string" || !/^(user|pair)_/.test(challengerId) ||
        typeof defenderId !== "string" || !/^(user|pair)_/.test(defenderId)) {
        return { status: 400, jsonBody: { success: false, message: "challenger_id and defender_id are required" } };
    }

    if (challengerId === defenderId) {
        return { status: 400, jsonBody: { success: false, message: "A player cannot challenge themselves" } };
    }

    // 1. Verify the request signature
    try {
        await doSignatureVerification(
            { callerId: caller_id, deviceId: device_id, url: request.url, signature },
            context
        );
    } catch (err) {
        return { status: 401, jsonBody: { success: false, message: err instanceof Error ? err.message : "Unauthorised" } };
    }

    // 2. The caller is the challenger or a ladder admin
    const ladder = await getRow("ladder", ladderId);

    if (!ladder) {
        return { status: 404, jsonBody: { success: false, message: "Ladder not found" } };
    }

    const competitorType = ladder.format === "doubles" ? "pair" : "user";
    if (!challengerId.startsWith(`${competitorType}_`) || !defenderId.startsWith(`${competitorType}_`)) {
        return { status: 400, jsonBody: { success: false, message: "Competitors must match the ladder format" } };
    }
    const challengerUsers = await doCompetitorUsers(guidsClient, challengerId);
    const defenderUsers = await doCompetitorUsers(guidsClient, defenderId);
    if (challengerUsers.length !== (competitorType === "pair" ? 2 : 1) ||
        defenderUsers.length !== (competitorType === "pair" ? 2 : 1) ||
        challengerUsers.some(id => defenderUsers.includes(id))) {
        return { status: 409, jsonBody: { success: false, message: "Invalid or overlapping competitors" } };
    }
    const callerRelation = await getRow(ladderId, caller_id);
    const isLadderAdmin = callerRelation?.is_admin === true;

    if (!challengerUsers.includes(caller_id) && !isLadderAdmin) {
        return { status: 403, jsonBody: { success: false, message: "Only the challenger or a ladder admin can create this match" } };
    }

    if (ladder.state !== "active") {
        return { status: 409, jsonBody: { success: false, message: "The ladder is not active" } };
    }

    // 3. Both players must be on the ladder and free to play
    const challenger = await getRow(ladderId, challengerId);
    const defender = await getRow(ladderId, defenderId);

    if (challenger?.is_participant !== true || defender?.is_participant !== true) {
        return { status: 409, jsonBody: { success: false, message: "Both players must be on the ladder" } };
    }

    const ongoing = ongoingMatch(challenger, defender, challengerUsers.includes(caller_id));
    if (ongoing) return ongoing;

    if (!(challenger.state === "active")) {
        return { status: 409, jsonBody: { success: false, message: "The challenger is not active on the ladder" } };
    }

    if (defender.state !== "active" && defender.state !== "cooling") {
        return { status: 409, jsonBody: { success: false, message: "The defender cannot be challenged right now" } };
    }

    // 4. The defender must be ranked above the challenger and within reach (ladder admins may set up any such match)
    const challengerRank = Number(challenger.rank);
    const steps = challengerRank - Number(defender.rank);

    if (!(steps > 0)) {
        return { status: 409, jsonBody: { success: false, message: "The defender must be ranked above the challenger" } };
    }

    if (!isLadderAdmin) {
        const system = String(ladder.ladder_system);
        let inReach: boolean;

        if (system === "win_points") {
            inReach = Number(challenger.points) >= steps;
        } else if (system === "ten_percent_fixed") {
            let count = 0;
            for await (const row of guidsClient.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${ladderId}` } })) {
                if (row.rowKey.startsWith(`${competitorType}_`) && row.is_participant === true) count++;
            }
            inReach = steps <= Math.floor(count / 10);
        } else if (system === "half_rank") {
            inReach = steps <= Math.floor(challengerRank / 2);
        } else {
            inReach = system === "static_1" && steps <= 1;
        }

        if (!inReach) {
            return { status: 409, jsonBody: { success: false, message: "The defender is out of reach" } };
        }
    }

    // 5. Create the match and mark both players busy
    const challengerUser = await getRow(competitorType, challengerId);
    const defenderUser = await getRow(competitorType, defenderId);
    const label = (row: Record<string, unknown> | undefined) => competitorType === "pair" ? String(row?.name ?? "Pair") : playerName(row?.name);
    const name = `${label(challengerUser)} vs ${label(defenderUser)}`;

    const matchId = doNewGuid("match");

    const entrants = [[challengerId, challenger], [defenderId, defender]] as const;
    const reservations: TransactionAction[] = entrants.map(([rowKey, relation]) => [
        "update", { partitionKey: ladderId, rowKey, state: "busy" }, "Merge", { etag: String(relation.etag) }
    ]);
    try {
        // Both entrants share the ladder partition. The transaction reserves them together
        // and rejects any request that validated against an older version of either row.
        await guidsClient.submitTransaction(reservations);
    } catch (error: any) {
        if (![404, 409, 412].includes(error?.statusCode)) throw error;
        const [currentChallenger, currentDefender] = await Promise.all([
            getRow(ladderId, challengerId), getRow(ladderId, defenderId)
        ]);
        return ongoingMatch(currentChallenger, currentDefender, challengerUsers.includes(caller_id)) ?? {
            status: 409, jsonBody: { success: false, message: "The ladder changed. Refresh and try again." }
        };
    }

    try {
        await doUpsertRelation(matchId, ladderId);
        await doUpsertRelation(matchId, challengerId, { role: "challenger" });
        await doUpsertRelation(matchId, defenderId, { role: "defender" });
        if (competitorType === "pair") {
            for (const [id, users] of [[challengerId, challengerUsers], [defenderId, defenderUsers]] as const) {
                for (const userId of users) await doUpsertRelation(matchId, userId, { role: "participant", competitor_id: id });
            }
        }
        for (const [id] of entrants) {
            await guidsClient.updateEntity({ partitionKey: id, rowKey: ladderId, state: "busy" }, "Merge");
        }
        // Until this write, no match entity can be accepted or scored.
        await doUpsertEntity("match", matchId, { name, state: "pending" });
    } catch (error) {
        // A write may report an error after the service commits it.
        if (!(await getRow("match", matchId))) {
            const linked = new Set([ladderId, challengerId, defenderId, ...challengerUsers, ...defenderUsers]);
            for (const id of linked) {
                for (const [pk, rk] of [[matchId, id], [id, matchId]]) {
                    try {
                        await guidsClient.deleteEntity(pk, rk);
                    } catch (cleanupError: any) {
                        if (cleanupError?.statusCode !== 404)
                            context.warn("Could not remove an incomplete challenge link", cleanupError);
                    }
                }
            }
            const restore: TransactionAction[] = [];
            for (const [id, previous] of entrants) {
                const current = await getRow(ladderId, id);
                if (current?.state !== "busy") continue;
                const state = previous.state;
                await guidsClient.updateEntity({ partitionKey: id, rowKey: ladderId, state }, "Merge");
                restore.push(["update", { partitionKey: ladderId, rowKey: id, state }, "Merge", { etag: String(current.etag) }]);
            }
            if (restore.length) await guidsClient.submitTransaction(restore);
            context.warn("Challenge creation failed before the match was saved", error);
            return { status: 503, jsonBody: { success: false, message: "The challenge could not be saved. Please try again." } };
        }
    }

    await doGuidsToPublic();

    await doSendPush({
        userIds: defenderUsers,
        exceptUserId: caller_id,
        heading: name,
        content: `You have been challenged to a match, accept within ${Number(ladder.cool_period ?? 3)} days or forfeit your rank`,
        path: `match/${matchId}`,
        collapseId: matchId
    }, context);

    context.log(`Created match ${matchId} on ladder ${ladderId}`);

    return {
        status: 201,
        jsonBody: {
            success: true,
            message: `Okay, match ${name} created`,
            subject: matchId,
            data: { match_id: matchId }
        }
    };
}

app.http("matchCreate", {
    methods: ["POST"],
    route: "match/create",
    authLevel: "anonymous",
    handler: matchCreate
});
