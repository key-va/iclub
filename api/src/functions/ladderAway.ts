import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
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

export async function ladderAway(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

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

    // 3. Only a participant can go away
    let relation: Record<string, unknown>;

    try {
        relation = await guidsClient.getEntity(ladderId, caller_id);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 409, jsonBody: { success: false, message: "You are not on this ladder" } };
        }
        throw err;
    }

    if (relation.is_participant !== true) {
        return { status: 409, jsonBody: { success: false, message: "You are not on this ladder" } };
    }

    if (relation.state === "away") {
        return { status: 409, jsonBody: { success: false, message: "You are already away" } };
    }

    // 4. Set the state, keeping the other attributes as the upsert replaces the row
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = relation;

    await doUpsertRelation(ladderId, caller_id, { ...attributes, state: "away" });

    await doGuidsToPublic();

    context.log(`User ${caller_id} is away on ladder ${ladderId}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, you are away on ${ladder.name}`,
            subject: ladderId
        }
    };
}

app.http("ladderAway", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/away",
    authLevel: "anonymous",
    handler: ladderAway
});
