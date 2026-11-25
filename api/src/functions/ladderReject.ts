import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectJoin } from "../services/joinRejection";
import { get, reply, signedEntityRequest } from "../services/clubEntityRequests";

export async function ladderReject(request: HttpRequest, context: InvocationContext) {
    const signed = await signedEntityRequest(request, context, "ladder");
    if ("status" in signed) return signed;
    const id = request.params.ladder_id;
    if (!id?.startsWith("ladder_")) return reply(400, "ladder_id is required");
    const ladder = await get("ladder", id);
    if (!ladder) return reply(404, "Ladder not found");
    if (ladder.state !== "active") return reply(409, "The ladder must be active");
    if ((await get(id, signed.caller_id))?.is_admin !== true)
        return reply(403, "Only a ladder admin can reject a join request");
    const user = signed.data.user_id;
    return rejectJoin(id, ladder, user, typeof user === "string" ? await get(id, user) : undefined, context);
}

app.http("ladderReject", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/reject",
    authLevel: "anonymous",
    handler: ladderReject,
});
