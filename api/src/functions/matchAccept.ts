import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertEntity } from "../services/doUpsertEntity";
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

export async function matchAccept(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const matchId = request.params.match_id;

    let body: { caller_id?: string; device_id?: string; signature?: string };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const { caller_id, device_id, signature } = body ?? {};

    if (!caller_id || !device_id || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id, device_id and signature are required" } };
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

    // 2. Fetch the match and its players
    const match = await getRow("match", matchId);

    if (!match) {
        return { status: 404, jsonBody: { success: false, message: "Match not found" } };
    }

    if (match.state !== "pending") {
        return { status: 409, jsonBody: { success: false, message: "This match is not waiting to be accepted" } };
    }

    let ladderId = "";
    let challengerId = "";
    let defenderId = "";

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${matchId}` }
    })) {
        const rk = relation.rowKey as string;
        if (rk.startsWith("ladder_")) ladderId = rk;
        else if (relation.role === "challenger") challengerId = rk;
        else if (relation.role === "defender") defenderId = rk;
    }

    if (!ladderId || !challengerId || !defenderId) {
        return { status: 409, jsonBody: { success: false, message: "This match is missing its ladder or players" } };
    }

    // 3. Only the defender or a ladder admin may accept
    const callerRelation = await getRow(ladderId, caller_id);

    if (caller_id !== defenderId && callerRelation?.is_admin !== true) {
        return { status: 403, jsonBody: { success: false, message: "Only the defender or a ladder admin can accept this match" } };
    }

    // 4. Accept, publish and let the challenger know
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = match;

    await doUpsertEntity("match", matchId, { ...attributes, state: "active" });

    await doGuidsToPublic();

    await doSendPush({
        userIds: [challengerId],
        exceptUserId: caller_id,
        heading: `${match.name}`,
        content: "Your challenge has been accepted",
        path: `match/${matchId}`,
        collapseId: matchId
    }, context);

    context.log(`Match ${matchId} accepted by ${caller_id}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: "Okay, challenge accepted",
            subject: matchId,
            data: { match_id: matchId }
        }
    };
}

app.http("matchAccept", {
    methods: ["POST"],
    route: "match/{match_id}/accept",
    authLevel: "anonymous",
    handler: matchAccept
});
