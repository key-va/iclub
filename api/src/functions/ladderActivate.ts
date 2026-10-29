import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doSendPush } from "../services/doSendPush";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

export async function ladderActivate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

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
    let entity: Record<string, unknown>;

    try {
        entity = await guidsClient.getEntity("ladder", ladderId);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 404, jsonBody: { success: false, message: "Ladder not found" } };
        }
        throw err;
    }

    if (entity.state !== "pending") {
        return { status: 409, jsonBody: { success: false, message: "Only a pending ladder can be activated" } };
    }

    // 3. Read the ladder's relations: its club and its admins
    const ladderAdmins: string[] = [];
    let clubId: string | undefined;

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
    })) {
        const other = relation.rowKey as string;

        if (other.startsWith("club_")) clubId = other;
        if (other.startsWith("user_") && relation.is_admin === true) ladderAdmins.push(other);
    }

    // 4. Only an admin of the ladder's club may activate it
    let isClubAdmin = false;

    if (clubId) {
        try {
            const relation = await guidsClient.getEntity(clubId, caller_id);
            isClubAdmin = relation.is_admin === true;
        } catch (err: any) {
            if (err?.statusCode !== 404) throw err;
        }
    }

    if (!isClubAdmin) {
        return { status: 403, jsonBody: { success: false, message: "Only a club admin can activate the ladder" } };
    }

    // 5. Activate (merge over what exists) and publish
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = entity;
    await doUpsertEntity("ladder", ladderId, { ...attributes, state: "active" });

    await doGuidsToPublic();

    if (ladderAdmins.length > 0) {
        await doSendPush({
            userIds: ladderAdmins,
            heading: "Ladder active",
            content: `${entity.name} has been approved and is now active`,
            path: `ladder/${ladderId}`,
            collapseId: ladderId
        }, context);
    }

    context.log(`Activated ladder ${ladderId}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, ladder ${entity.name} is now active`,
            subject: ladderId
        }
    };
}

app.http("ladderActivate", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/activate",
    authLevel: "anonymous",
    handler: ladderActivate
});
