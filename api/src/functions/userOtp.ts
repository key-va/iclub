import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
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

export async function userOtp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    let body: { email?: string; phone?: string };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { message: "Invalid JSON payload", data: [] } };
    }

    const contact = body?.email || body?.phone;

    if (!contact) {
        return { status: 400, jsonBody: { message: "email or phone is required", data: [] } };
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

    if (!user) {
        return { status: 404, jsonBody: { message: "User not found", data: [] } };
    }

    const { partitionKey, rowKey, timestamp, etag, ...properties } = user;
    const userId = rowKey as string;

    // Placeholder: will become 6 random digits sent by email or sms
    await doUpsertAuth("user", userId, { ...properties, otp: "111111" });

    context.log(`Otp set for ${userId}`);

    return {
        status: 200,
        jsonBody: {
            message: `Okay, Otp sent to ${properties.name}`,
            data: [
                { pk: userId }
            ]
        }
    };
}

app.http("userOtp", {
    methods: ["POST"],
    route: "user/otp",
    authLevel: "anonymous",
    handler: userOtp
});
