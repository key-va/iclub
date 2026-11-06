import { doCompetitorUsers } from "../services/doCompetitorUsers";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doCompleteMatch } from "../services/doCompleteMatch";
import { doSendPush } from "../services/doSendPush";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

const isScore = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 99;

// Games won in each set; a bare number is a single set
const toSets = (value: unknown): number[] | undefined => {
    const sets = typeof value === "number" ? [value] : value;
    return Array.isArray(sets) && sets.length > 0 && sets.length <= 5 && sets.every(isScore) ? sets : undefined;
};

const setsWon = (a: number[], b: number[]) => a.filter((games, i) => games > b[i]).length;

export async function matchComplete(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const matchId = request.params.match_id;

    let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: { challenger_score?: unknown; defender_score?: unknown };
    };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const { caller_id, device_id, signature, data } = body ?? {};

    if (!caller_id || !device_id || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id, device_id and signature are required" } };
    }

    const challengerScore = toSets(data?.challenger_score);
    const defenderScore = toSets(data?.defender_score);

    if (!challengerScore || !defenderScore || challengerScore.length !== defenderScore.length) {
        return { status: 400, jsonBody: { success: false, message: "Both players need the same number of set scores, each a whole number from 0 to 99" } };
    }

    if (setsWon(challengerScore, defenderScore) === setsWon(defenderScore, challengerScore)) {
        return { status: 400, jsonBody: { success: false, message: "The scores cannot be a draw" } };
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

    // 2. Only an active match can be scored, by one of its players or a ladder admin
    let match: Record<string, unknown>;

    try {
        match = await guidsClient.getEntity("match", matchId);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 404, jsonBody: { success: false, message: "Match not found" } };
        }
        throw err;
    }

    if (match.state !== "active") {
        return { status: 409, jsonBody: { success: false, message: "This match is not ready for a score" } };
    }

    let ladderId = "";
    let isPlayer = false;

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${matchId}` }
    })) {
        const rk = relation.rowKey as string;
        if (rk.startsWith("ladder_")) ladderId = rk;
        else if (rk === caller_id && ["challenger", "defender", "participant"].includes(String(relation.role))) isPlayer = true;
    }

    let isLadderAdmin = false;

    if (!isPlayer && ladderId) {
        try {
            isLadderAdmin = (await guidsClient.getEntity(ladderId, caller_id)).is_admin === true;
        } catch (err: any) {
            if (err?.statusCode !== 404) throw err;
        }
    }

    if (!isPlayer && !isLadderAdmin) {
        return { status: 403, jsonBody: { success: false, message: "Only a player or a ladder admin can submit the score" } };
    }

    // A super set is a single set; the other formats are played over two or three sets
    const ladder = ladderId ? await guidsClient.getEntity("ladder", ladderId).catch(() => undefined) : undefined;

    if ((ladder?.match_format ?? "super_set") === "super_set" && challengerScore.length !== 1) {
        return { status: 400, jsonBody: { success: false, message: "A super set has a single score for each player" } };
    }

    // 3. Apply the result
    const result = await doCompleteMatch(
        { matchId, challengerScore, defenderScore },
        context
    );

    if (!result.ok) {
        return { status: result.status, jsonBody: { success: false, message: result.message } };
    }

    // 4. Tell the other player
    await doSendPush({
        userIds: result.userIds!,
        exceptUserId: caller_id,
        heading: result.matchName!,
        content: "Match scores have been submitted",
        path: `match/${matchId}`,
        collapseId: matchId
    }, context);

    return {
        status: 200,
        jsonBody: { success: true, message: result.message, subject: matchId, data: { match_id: matchId } }
    };
}

app.http("matchComplete", {
    methods: ["POST"],
    route: "match/{match_id}/complete",
    authLevel: "anonymous",
    handler: matchComplete
});
