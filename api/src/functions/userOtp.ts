import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doUpsertAuth } from "../services/doUpsertAuth";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "auths",
    new DefaultAzureCredential()
);

export async function userOtp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    let body: { data?: { email?: string; phone?: string } };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const contact = body?.data?.email?.trim().toLowerCase() || body?.data?.phone;

    if (!contact) {
        return { status: 400, jsonBody: { success: false, message: "email or phone is required" } };
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

    // Unknown contact is not an error: the client uses it to start the create flow
    if (!user) {
        return {
            status: 200,
            jsonBody: {
                success: true,
                message: "No user found, please enter your name to create one",
                data: { exists: false }
            }
        };
    }

    const { partitionKey, rowKey, timestamp, etag, ...properties } = user;
    const userId = rowKey as string;

    // Placeholder: will become 6 random digits sent by email or sms
    await doUpsertAuth("user", userId, { ...properties, otp: "111111" });

    context.log(`Otp set for ${userId}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, Otp sent to ${properties.name}`,
            data: { exists: true }
        }
    };
}

app.http("userOtp", {
    methods: ["POST"],
    route: "user/otp",
    authLevel: "anonymous",
    handler: userOtp
});
