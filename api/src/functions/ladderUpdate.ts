import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doAssetToPublic } from "../services/doAssetToPublic";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const maxImageBytes = 1024 * 1024;

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

export async function ladderUpdate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const ladderId = request.params.ladder_id;

    let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: { name?: string; image?: string };
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

    // 3. Only a ladder admin may update it
    try {
        const relation = await guidsClient.getEntity(ladderId, caller_id);

        if (relation.isAdmin !== true) throw new Error("not admin");
    } catch {
        return { status: 403, jsonBody: { success: false, message: "Only a ladder admin can update the ladder" } };
    }

    // 4. Only the name and image can change after creation
    const name = data?.name?.trim();

    if (data?.name !== undefined && !name) {
        return { status: 400, jsonBody: { success: false, message: "name cannot be empty" } };
    }

    let image: Buffer | undefined;

    if (data?.image) {
        image = Buffer.from(data.image.replace(/^data:image\/jpe?g;base64,/i, ""), "base64");

        const isJpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;

        if (image.length === 0 || image.length > maxImageBytes || !isJpeg) {
            return { status: 400, jsonBody: { success: false, message: "image must be a JPEG of 1MB or less" } };
        }
    }

    // 5. Apply the changes (merge over what exists)
    if (name) {
        const { partitionKey, rowKey, timestamp, etag, ...attributes } = entity;
        await doUpsertEntity("ladder", ladderId, { ...attributes, name });
    }

    if (image) {
        await doAssetToPublic(image, `${ladderId}.jpg`);
    }

    // 6. Publish
    await doGuidsToPublic();

    context.log(`Updated ladder ${ladderId}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, ladder ${name ?? entity.name} updated`,
            subject: ladderId
        }
    };
}

app.http("ladderUpdate", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/update",
    authLevel: "anonymous",
    handler: ladderUpdate
});
