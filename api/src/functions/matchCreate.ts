import { doCompetitorUsers } from "../services/doCompetitorUsers";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
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

const firstName = (name: unknown) => String(name ?? "").trim().split(/\s+/)[0] || "Player";

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

    if (!caller_id || !device_id || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id, device_id and signature are required" } };
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
        } else if (system === "half_rank") {
            inReach = steps <= Math.floor(challengerRank / 2);
        } else {
            inReach = steps <= Number(system.match(/^static_range_(\d+)$/)?.[1]);
        }

        if (!inReach) {
            return { status: 409, jsonBody: { success: false, message: "The defender is out of reach" } };
        }
    }

    // 5. Create the match and mark both players busy
    const challengerUser = await getRow(competitorType, challengerId);
    const defenderUser = await getRow(competitorType, defenderId);
    const label = (row: Record<string, unknown> | undefined) => competitorType === "pair" ? String(row?.name ?? "Pair") : firstName(row?.name);
    const name = `${label(challengerUser)} vs ${label(defenderUser)}`;

    const matchId = doNewGuid("match");

    await doUpsertEntity("match", matchId, { name, state: "pending" });
    await doUpsertRelation(matchId, ladderId);
    await doUpsertRelation(matchId, challengerId, { role: "challenger" });
    await doUpsertRelation(matchId, defenderId, { role: "defender" });

    if (competitorType === "pair") {
        for (const [id, users] of [[challengerId, challengerUsers], [defenderId, defenderUsers]] as const) {
            for (const userId of users) await doUpsertRelation(matchId, userId, { role: "participant", competitor_id: id });
        }
    }

    // Keep existing attributes as the upsert replaces the row
    for (const [userId, relation] of [[challengerId, challenger], [defenderId, defender]] as const) {
        const { partitionKey, rowKey, timestamp, etag, ...attributes } = relation;
        await doUpsertRelation(ladderId, userId, { ...attributes, state: "busy" });
    }

    await doGuidsToPublic();

    await doSendPush({
        userIds: defenderUsers,
        exceptUserId: caller_id,
        heading: name,
        content: `You have been challenged to a match, accept within ${Number(ladder.cool_period ?? 2)} days or forfeit your rank`,
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
