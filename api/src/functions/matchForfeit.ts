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

// Games won in each set; a bare number is a single set. Undefined when absent or invalid.
const toSets = (value: unknown): number[] | undefined => {
    const sets = typeof value === "number" ? [value] : value;
    return Array.isArray(sets) && sets.length > 0 && sets.length <= 5 && sets.every(isScore) ? sets : undefined;
};

export async function matchForfeit(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

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

    // Scores are optional when forfeiting, but must be valid when given
    const challengerScore = toSets(data?.challenger_score);
    const defenderScore = toSets(data?.defender_score);

    if ((data?.challenger_score !== undefined && !challengerScore) ||
        (data?.defender_score !== undefined && !defenderScore)) {
        return { status: 400, jsonBody: { success: false, message: "Scores must be whole numbers from 0 to 99" } };
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

    // 2. Only a player in the match can forfeit it
    let isPlayer = false;

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${matchId}` }
    })) {
        if (relation.rowKey === caller_id && (relation.role === "challenger" || relation.role === "defender")) {
            isPlayer = true;
        }
    }

    if (!isPlayer) {
        return { status: 403, jsonBody: { success: false, message: "Only a player in this match can forfeit it" } };
    }

    // 3. Apply the result
    const result = await doCompleteMatch(
        { matchId, forfeiterId: caller_id, challengerScore, defenderScore },
        context
    );

    if (!result.ok) {
        return { status: result.status, jsonBody: { success: false, message: result.message } };
    }

    // 4. Tell the opponent
    await doSendPush({
        userIds: [result.challengerId!, result.defenderId!],
        exceptUserId: caller_id,
        heading: result.matchName!,
        content: "Your opponent has forfeited the match",
        path: `match/${matchId}`,
        collapseId: matchId
    }, context);

    return {
        status: 200,
        jsonBody: { success: true, message: result.message, subject: matchId, data: { match_id: matchId } }
    };
}

app.http("matchForfeit", {
    methods: ["POST"],
    route: "match/{match_id}/forfeit",
    authLevel: "anonymous",
    handler: matchForfeit
});
