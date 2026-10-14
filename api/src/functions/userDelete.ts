import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doUpsertEntity } from "../services/doUpsertEntity";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const credential = new DefaultAzureCredential();
const endpoint = `https://${storageAccount}.table.core.windows.net`;
const guidsClient = new TableClient(endpoint, "guids", credential);
const authsClient = new TableClient(endpoint, "auths", credential);

export async function userDelete(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const userId = request.params.user_id;

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

    // 2. Only a user may delete themselves
    if (caller_id !== userId) {
        return { status: 403, jsonBody: { success: false, message: "You can only delete your own account" } };
    }

    // 3. Keep the user's entity and relations (history such as matches still refers to them),
    // but anonymise the name.
    try {
        const entity = await guidsClient.getEntity("user", userId);
        const { partitionKey, rowKey, timestamp, etag, ...attributes } = entity;

        await doUpsertEntity("user", userId, { ...attributes, name: "User Removed" });
    } catch (err: any) {
        if (err?.statusCode !== 404) throw err;
    }

    // 4. Remove everything in auths so the user can no longer log in
    // (deleting a missing row is a no-op, so repeating the call is safe)
    const devices: string[] = [];

    for await (const row of authsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${userId}`, select: ["RowKey"] }
    })) {
        devices.push(row.rowKey as string);
    }

    for (const device of devices) {
        await authsClient.deleteEntity(userId, device);
    }

    await authsClient.deleteEntity("user", userId);

    // 5. Publish
    await doGuidsToPublic();

    context.log(`Removed user ${userId}`);

    // 6. Respond
    return {
        status: 200,
        jsonBody: {
            success: true,
            message: "Okay, user removed"
        }
    };
}

app.http("userDelete", {
    methods: ["POST"],
    route: "user/{user_id}/delete",
    authLevel: "anonymous",
    handler: userDelete
});
