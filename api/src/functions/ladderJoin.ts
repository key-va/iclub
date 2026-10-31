import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

export async function ladderJoin(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const ladderId = request.params.ladder_id;

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

    // 2. Fetch the ladder; only an active ladder accepts players
    let ladder: Record<string, unknown>;

    try {
        ladder = await guidsClient.getEntity("ladder", ladderId);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 404, jsonBody: { success: false, message: "Ladder not found" } };
        }
        throw err;
    }

    if (ladder.state !== "active") {
        return { status: 409, jsonBody: { success: false, message: "Only an active ladder can be joined" } };
    }

    // 3. Read the ladder's relations: the caller's existing one (e.g. admin) and the lowest rank in use
    let existing: Record<string, unknown> | undefined;
    let lastRank = 0;

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
    })) {
        const other = relation.rowKey as string;

        if (!other.startsWith("user_")) continue;

        if (other === caller_id) existing = relation;

        if (relation.is_participant === true && typeof relation.rank === "number" && relation.rank > lastRank) lastRank = relation.rank;
    }

    if (existing?.is_participant === true) {
        return { status: 409, jsonBody: { success: false, message: "You are already on this ladder" } };
    }

    // 4. Join at the bottom; points only apply to the win_points ladder system
    const rank = lastRank + 1;
    const points = ladder.ladder_system === "win_points" ? rank : 0;

    // Keep any attributes already on the relation (for example is_admin) as the upsert replaces the row
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = existing ?? {};

    await doUpsertRelation(ladderId, caller_id, { ...attributes, is_participant: true, rank, points, state: "active" });

    // 5. Publish
    await doGuidsToPublic();

    context.log(`User ${caller_id} joined ladder ${ladderId} at rank ${rank}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, you joined ${ladder.name} at rank ${rank}`,
            subject: ladderId,
            data: { rank, points }
        }
    };
}

app.http("ladderJoin", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/join",
    authLevel: "anonymous",
    handler: ladderJoin
});
