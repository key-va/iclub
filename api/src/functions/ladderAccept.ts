import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
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

async function getRelation(a: string, b: string): Promise<Record<string, unknown> | undefined> {
    try {
        return await guidsClient.getEntity(a, b);
    } catch (err: any) {
        if (err?.statusCode === 404) return undefined;
        throw err;
    }
}

export async function ladderAccept(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const ladderId = request.params.ladder_id;

    let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: { user_id?: string };
    };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const { caller_id, device_id, signature, data } = body ?? {};
    const userId = data?.user_id;

    if (!caller_id || !device_id || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id, device_id and signature are required" } };
    }

    if (typeof userId !== "string" || !userId.startsWith("user_")) {
        return { status: 400, jsonBody: { success: false, message: "user_id is required" } };
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

    // 2. Fetch the ladder
    let ladder: Record<string, unknown>;

    try {
        ladder = await guidsClient.getEntity("ladder", ladderId);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 404, jsonBody: { success: false, message: "Ladder not found" } };
        }
        throw err;
    }

    // 3. Only a ladder admin may accept a player
    const callerRelation = await getRelation(ladderId, caller_id);

    if (callerRelation?.is_admin !== true) {
        return { status: 403, jsonBody: { success: false, message: "Only a ladder admin can accept a player" } };
    }

    // 4. The player must be waiting to join
    const playerRelation = await getRelation(ladderId, userId);

    if (playerRelation?.state !== "pending" || playerRelation.is_participant === true) {
        return { status: 409, jsonBody: { success: false, message: "That player is not waiting to join" } };
    }

    // 5. Add the player at the bottom, publish and let them know
    let lastRank = 0;

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
    })) {
        if (relation.is_participant === true && typeof relation.rank === "number" && relation.rank > lastRank) {
            lastRank = relation.rank;
        }
    }

    const rank = lastRank + 1;
    const points = ladder.ladder_system === "win_points" ? rank : 0;

    // Keep existing attributes (for example is_admin) as the upsert replaces the row
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = playerRelation;

    await doUpsertRelation(ladderId, userId, { ...attributes, is_participant: true, rank, points, state: "active" });

    await doGuidsToPublic();

    await doSendPush({
        userIds: [userId],
        heading: `${ladder.name}`,
        content: "You have been accepted, go forth and play tennis",
        path: `ladder/${ladderId}`,
        collapseId: `${ladderId}`
    }, context);

    context.log(`Accepted ${userId} onto ladder ${ladderId} at rank ${rank}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, player accepted at rank ${rank}`,
            subject: ladderId,
            data: { rank }
        }
    };
}

app.http("ladderAccept", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/accept",
    authLevel: "anonymous",
    handler: ladderAccept
});
