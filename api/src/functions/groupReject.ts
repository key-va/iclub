import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectJoin } from "../services/joinRejection";
import { reply, withGroup } from "../services/clubEntityRequests";

export async function groupReject(request: HttpRequest, context: InvocationContext) {
    return withGroup(request, context, async ({ id, group, mine, links, data }) => {
        if (group.state !== "active") return reply(409, "The group must be active");
        if (mine?.is_admin !== true) return reply(403, "Only a group admin can reject a join request");
        return rejectJoin(id, group, data.user_id, links.find(row => row.rowKey === data.user_id), context);
    });
}

app.http("groupReject", {
    methods: ["POST"],
    route: "group/{group_id}/reject",
    authLevel: "anonymous",
    handler: groupReject,
});
