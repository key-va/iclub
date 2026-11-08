import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doWebPushConfig, isPushEndpoint } from "../services/doWebPushConfig";
import { resourceName, resourceSuffix } from "../stores/resourceNames";

const client = new TableClient(`https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`, "auths", new DefaultAzureCredential());

export async function userPush(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    let body: any;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } }; }
    const { caller_id, device_id, signature, data } = body ?? {};
    if (typeof caller_id !== "string" || !caller_id.startsWith("user_") ||
        typeof device_id !== "string" || !device_id.startsWith("device_") || typeof signature !== "string") {
        return { status: 400, jsonBody: { success: false, message: "caller_id, device_id and signature are required" } };
    }
    try {
        await doSignatureVerification({ callerId: caller_id, deviceId: device_id, url: request.url, signature }, context);
    } catch { return { status: 401, jsonBody: { success: false, message: "Unauthorised" } }; }

    const subscription = data?.subscription;
    const headersOrigin = request.headers.get("origin");
    let origin: string;
    try {
        const url = new URL(headersOrigin ?? "");
        if (url.origin !== headersOrigin || (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))) throw Error();
        origin = url.origin;
    } catch { return { status: 400, jsonBody: { success: false, message: "A valid frontend Origin is required" } }; }

    if (subscription !== null && (!isPushEndpoint(subscription?.endpoint) ||
        !/^[\w-]{87}$/.test(subscription?.keys?.p256dh ?? "") || !/^[\w-]{22}$/.test(subscription?.keys?.auth ?? ""))) {
        return { status: 400, jsonBody: { success: false, message: "Invalid push subscription" } };
    }
    if (subscription !== null && !doWebPushConfig()) {
        return { status: 503, jsonBody: { success: false, message: "Web Push is not configured" } };
    }

    // Merge only push attributes: never replace the authentication public key.
    if (subscription !== null) {
        // The same browser subscription can survive logout/login and receive a new device ID.
        // Remove older bindings so it cannot receive duplicates or a previous account's messages.
        for await (const row of client.listEntities({ queryOptions: { filter: odata`push_endpoint eq ${subscription.endpoint}` } })) {
            if (row.partitionKey === caller_id && row.rowKey === device_id) continue;
            await client.updateEntity({ partitionKey: row.partitionKey, rowKey: row.rowKey, push_endpoint: "", push_p256dh: "", push_auth: "" }, "Merge", { etag: row.etag });
        }
    }
    await client.updateEntity({
        partitionKey: caller_id, rowKey: device_id, origin,
        push_endpoint: subscription?.endpoint ?? "",
        push_p256dh: subscription?.keys.p256dh ?? "",
        push_auth: subscription?.keys.auth ?? ""
    }, "Merge");
    return { status: 200, jsonBody: { success: true, message: subscription ? "Push registered" : "Push removed" } };
}

app.http("userPush", { methods: ["POST"], route: "user/push", authLevel: "anonymous", handler: userPush });
