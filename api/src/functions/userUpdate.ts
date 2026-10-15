import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertAuth } from "../services/doUpsertAuth";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const credential = new DefaultAzureCredential();
const endpoint = `https://${storageAccount}.table.core.windows.net`;
const guidsClient = new TableClient(endpoint, "guids", credential);
const authsClient = new TableClient(endpoint, "auths", credential);

export async function userUpdate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const userId = request.params.user_id;

    let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: { name?: string; email?: string; phone?: string };
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

    // 1. Verify the request signature
    try {
        await doSignatureVerification(
            { callerId: caller_id, deviceId: device_id, url: request.url, signature },
            context
        );
    } catch (err) {
        return { status: 401, jsonBody: { success: false, message: err instanceof Error ? err.message : "Unauthorised" } };
    }

    // 2. Fetch the target entity
    let entity: Record<string, unknown>;

    try {
        entity = await guidsClient.getEntity("user", userId);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 404, jsonBody: { success: false, message: "User not found" } };
        }
        throw err;
    }

    // 3. Only a user may update themselves
    if (caller_id !== userId) {
        return { status: 403, jsonBody: { success: false, message: "You can only update your own details" } };
    }

    const name = data?.name?.trim();
    const email = data?.email?.trim().toLowerCase();
    const phone = data?.phone?.replace(/[\s\-().+]/g, "");

    if (data?.name !== undefined && !name) {
        return { status: 400, jsonBody: { success: false, message: "name cannot be empty" } };
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { status: 400, jsonBody: { success: false, message: "email is not a valid address" } };
    }

    if (phone && !/^\d{8,15}$/.test(phone)) {
        return { status: 400, jsonBody: { success: false, message: "phone must be 8 to 15 digits including country code" } };
    }

    // Email and phone identify a login, so they must stay unique
    for (const [field, value] of [["email", email], ["phone", phone]] as const) {
        if (!value) continue;

        const matches = authsClient.listEntities({
            queryOptions: {
                filter: field === "email"
                    ? odata`PartitionKey eq 'user' and email eq ${value}`
                    : odata`PartitionKey eq 'user' and phone eq ${value}`,
                select: ["RowKey"]
            }
        });

        for await (const match of matches) {
            if (match.rowKey !== userId) {
                return { status: 409, jsonBody: { success: false, message: `That ${field} is already in use` } };
            }
        }
    }

    // 4. Apply the changes (merge over what exists)
    if (name) {
        const { partitionKey, rowKey, timestamp, etag, ...attributes } = entity;
        await doUpsertEntity("user", userId, { ...attributes, name });
    }

    let auth: Record<string, unknown> = {};

    try {
        auth = await authsClient.getEntity("user", userId);
    } catch (err: any) {
        if (err?.statusCode !== 404) throw err;
    }

    const { partitionKey: _pk, rowKey: _rk, timestamp: _ts, etag: _et, ...authAttributes } = auth;

    await doUpsertAuth("user", userId, {
        ...authAttributes,
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {})
    });

    // 5. Publish
    await doGuidsToPublic();

    context.log(`Updated user ${userId}`);

    // 6. Respond
    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, user ${name ?? entity.name} updated`,
            subject: userId
        }
    };
}

app.http("userUpdate", {
    methods: ["POST"],
    route: "user/{user_id}/update",
    authLevel: "anonymous",
    handler: userUpdate
});
