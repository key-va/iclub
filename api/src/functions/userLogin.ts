import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { createPublicKey } from "crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertAuth } from "../services/doUpsertAuth";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "auths",
    new DefaultAzureCredential()
);

export async function userLogin(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    let body: { email?: string; phone?: string; otp?: string; key?: string };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { message: "Invalid JSON payload", data: [] } };
    }

    const { email, phone, otp, key } = body ?? {};
    const contact = email || phone;

    if (!contact || !otp || !key) {
        return { status: 400, jsonBody: { message: "email or phone, otp and key are required", data: [] } };
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
        return { status: 400, jsonBody: { message: "key must be a Base64 SPKI EC public key", data: [] } };
    }

    const entities = tableClient.listEntities({
        queryOptions: {
            filter: odata`PartitionKey eq 'user' and (email eq ${contact} or phone eq ${contact})`
        }
    });

    let user: Record<string, unknown> | undefined;

    for await (const entity of entities) {
        user = entity;
        break;
    }

    if (!user || !user.otp || user.otp !== otp) {
        return { status: 401, jsonBody: { message: "Invalid otp", data: [] } };
    }

    const { partitionKey, rowKey, timestamp, etag, otp: used, ...properties } = user;
    const userId = rowKey as string;
    const deviceId = doNewGuid("device");

    await doUpsertAuth(userId, deviceId, { key });

    // Otp is single use
    await doUpsertAuth("user", userId, properties);

    context.log(`Login for ${userId} with device ${deviceId}`);

    return {
        status: 200,
        jsonBody: {
            message: `Okay, user ${properties.name} logged in`,
            data: [
                { pk: userId, rk: deviceId }
            ]
        }
    };
}

app.http("userLogin", {
    methods: ["POST"],
    route: "user/login",
    authLevel: "anonymous",
    handler: userLogin
});
