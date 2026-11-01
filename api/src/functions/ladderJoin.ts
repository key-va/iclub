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

    // 3. Read the caller's existing relation to the ladder (for example admin) and the ladder admins
    let existing: Record<string, unknown> | undefined;
    const ladderAdmins: string[] = [];

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
    })) {
        const other = relation.rowKey as string;

        if (!other.startsWith("user_")) continue;

        if (other === caller_id) existing = relation;
        if (relation.is_admin === true) ladderAdmins.push(other);
    }

    if (existing?.is_participant === true) {
        return { status: 409, jsonBody: { success: false, message: "You are already on this ladder" } };
    }

    if (existing?.state === "pending") {
        return { status: 409, jsonBody: { success: false, message: "Your request to join is waiting for the ladder admin" } };
    }

    // 4. Wait for a ladder admin to accept; keep existing attributes (for example is_admin) as the upsert replaces the row
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = existing ?? {};

    await doUpsertRelation(ladderId, caller_id, { ...attributes, is_participant: false, state: "pending" });

    // 5. Publish and ask the ladder admins to accept
    await doGuidsToPublic();

    if (ladderAdmins.length > 0) {
        let playerName = "A player";

        try {
            const user = await guidsClient.getEntity("user", caller_id);
            if (typeof user.name === "string" && user.name) playerName = user.name;
        } catch {
            // fall back to the generic name
        }

        await doSendPush({
            userIds: ladderAdmins,
            heading: `${ladder.name}`,
            content: `${playerName} has requested to join`,
            path: `ladder/${ladderId}`,
            collapseId: `${ladderId}_${caller_id}`
        }, context);
    }

    context.log(`User ${caller_id} asked to join ladder ${ladderId}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, your request to join ${ladder.name} is waiting for the ladder admin`,
            subject: ladderId
        }
    };
}

app.http("ladderJoin", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/join",
    authLevel: "anonymous",
    handler: ladderJoin
});
