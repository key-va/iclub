import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { entityEdits, loadEntity, reply, signedEntityRequest } from "../services/clubEntityRequests";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { updateIfCurrent } from "../services/joinRejection";

export async function compUpdate(request: HttpRequest, context: InvocationContext) {
    const signed = await signedEntityRequest(request, context, "comp");
    if ("status" in signed) return signed;
    const input = await loadEntity(request, "comp", signed);
    if ("status" in input) return input;
    const { id, group: comp, mine } = input;
    if (mine?.is_admin !== true) return reply(403, "Only a comp admin can edit this comp");
    if (comp.state !== "pending") return reply(409, "This comp can be edited while awaiting club approval");

    const edits = entityEdits(signed.data, false);
    if ("status" in edits) return edits;
    const { name, image } = edits;
    if (name !== undefined && !(await updateIfCurrent(comp, { name })))
        return reply(409, "The comp changed. Refresh and retry.");
    if (image) await doAssetToPublic(image, `${id}.jpg`);
    await doGuidsToPublic();
    return reply(200, "Comp updated", id);
}

app.http("compUpdate", {
    methods: ["POST"],
    route: "comp/{comp_id}/update",
    authLevel: "anonymous",
    handler: compUpdate,
});
