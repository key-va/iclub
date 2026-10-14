import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { createPublicKey } from "crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertAuth } from "../services/doUpsertAuth";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const authsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "auths",
    new DefaultAzureCredential()
);

export async function userCreate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    let body: { data?: { name?: string; email?: string; phone?: string; key?: string } };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const { name, email, phone, key } = body?.data ?? {};

    if (!name || !email || !key) {
        return { status: 400, jsonBody: { success: false, message: "name, email and key are required" } };
    }

    try {
        const publicKey = createPublicKey({
            key: Buffer.from(key, "base64"),
            format: "der",
            type: "spki"
        });

        if (publicKey.asymmetricKeyType !== "ec") {
            throw new Error("Not an EC key");
        }
    } catch {
        return { status: 400, jsonBody: { success: false, message: "key must be a Base64 SPKI EC public key" } };
    }

    // An existing email (or phone) means the caller should log in instead
    const existing = authsClient.listEntities({
        queryOptions: {
            filter: phone
                ? odata`PartitionKey eq 'user' and (email eq ${email} or phone eq ${phone})`
                : odata`PartitionKey eq 'user' and email eq ${email}`,
            select: ["RowKey"]
        }
    });

    for await (const _ of existing) {
        return { status: 409, jsonBody: { success: false, message: "A user with that email or phone already exists, please log in" } };
    }

    const userId = doNewGuid("user");
    const deviceId = doNewGuid("device");

    await doUpsertAuth(userId, deviceId, { key });
    await doUpsertAuth("user", userId, { name, email, ...(phone ? { phone } : {}) });
    await doUpsertEntity("user", userId, { name });

    await doGuidsToPublic();

    context.log(`Created user ${userId} with device ${deviceId}`);

    return {
        status: 201,
        jsonBody: {
            success: true,
            message: `Okay, user ${name} created`,
            subject: userId,
            data: { user_id: userId, device_id: deviceId }
        }
    };
}

app.http("userCreate", {
    methods: ["POST"],
    route: "user/create",
    authLevel: "anonymous",
    handler: userCreate
});
