import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { client, entityEdits, loadEntity, reply, signedEntityRequest } from "../services/clubEntityRequests";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

export async function groupUpdate(request: HttpRequest, context: InvocationContext) {
    const signed = await signedEntityRequest(request, context, "group");
    if ("status" in signed) return signed;
    const edits = entityEdits(signed.data, false);
    if ("status" in edits) return edits;
    const groupRequest = await loadEntity(request, "group", signed);
    if ("status" in groupRequest) return groupRequest;
    const { id, group, mine } = groupRequest;
    const { name, image } = edits;
    if (mine?.is_admin !== true)
        return reply(403, "Only a group admin can update the group");
    if (image) await doAssetToPublic(image, `${id}.jpg`);
    if (name !== undefined)
        await client.updateEntity(
            { partitionKey: "group", rowKey: id, name },
            "Merge",
            { etag: group.etag },
        );
    await doGuidsToPublic();
    return reply(200, "Group updated", id);
}

app.http("groupUpdate", {
    methods: ["POST"],
    route: "group/{group_id}/update",
    authLevel: "anonymous",
    handler: groupUpdate,
});
