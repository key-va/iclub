import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doAssetFromPublic } from "../services/doAssetFromPublic";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

export async function ladderDelete(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

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

    // 2. The ladder must exist
    try {
        await guidsClient.getEntity("ladder", ladderId);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 404, jsonBody: { success: false, message: "Ladder not found" } };
        }
        throw err;
    }

    // 3. Only a ladder admin may delete it
    try {
        const relation = await guidsClient.getEntity(ladderId, caller_id);

        if (relation.is_admin !== true) throw new Error("not admin");
    } catch {
        return { status: 403, jsonBody: { success: false, message: "Only a ladder admin can delete the ladder" } };
    }

    // 4. Remove every relation row in both directions, then the ladder entity
    // (deleting a missing row is a no-op, so repeating the call is safe)
    const related: string[] = [];

    for await (const row of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${ladderId}`, select: ["RowKey"] }
    })) {
        related.push(row.rowKey as string);
    }

    for (const other of related) {
        await guidsClient.deleteEntity(other, ladderId);
        await guidsClient.deleteEntity(ladderId, other);
    }

    await guidsClient.deleteEntity("ladder", ladderId);

    await doAssetFromPublic(`${ladderId}.jpg`);

    // 5. Publish
    await doGuidsToPublic();

    context.log(`Deleted ladder ${ladderId}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: "Okay, ladder deleted"
        }
    };
}

app.http("ladderDelete", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/delete",
    authLevel: "anonymous",
    handler: ladderDelete
});
