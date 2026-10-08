import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { createPublicKey } from "crypto";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertAuth } from "../services/doUpsertAuth";

export async function userNew(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    let body: { name?: string; key?: string; email?: string; phone?: string };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { message: "Invalid JSON payload", data: [] } };
    }

    const { name, key, email, phone } = body ?? {};

    if (!name || !key) {
        return { status: 400, jsonBody: { message: "name and key are required", data: [] } };
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

    const userId = doNewGuid("user");
    const deviceId = doNewGuid("device");

    await doUpsertAuth(userId, deviceId, { key });
    await doUpsertAuth("user", userId, { name, email, phone });
    await doUpsertEntity("user", userId, { name });

    context.log(`Created user ${userId} with device ${deviceId}`);

    return {
        status: 201,
        jsonBody: {
            message: `Okay, user ${name} created`,
            data: [
                { pk: userId, rk: deviceId }
            ]
        }
    };
}

app.http("userNew", {
    methods: ["POST"],
    route: "user/new",
    authLevel: "anonymous",
    handler: userNew
});
