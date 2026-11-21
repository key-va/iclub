import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { reply, withGroup } from "../services/clubEntityRequests";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

export async function groupJoin(request: HttpRequest, context: InvocationContext) {
    return withGroup(request, context, async ({ id, group, mine, links, caller, caller_id, notify }) => {
        if (group.state !== "active") return reply(409, "The group must be active");
        if (mine && mine.state !== "left")
            return reply(
                409,
                "You already belong to this group or have a pending request",
            );
        await doUpsertRelation(id, caller_id, {
            state: "pending",
            is_participant: false,
        });
        await doGuidsToPublic();
        await notify(
            links
                .filter(
                    (row) =>
                        row.rowKey.startsWith("user_") && row.is_admin === true,
                )
                .map((row) => row.rowKey),
            String(group.name),
            `${caller.name || "A player"} has requested to join`,
            id,
        );
        return reply(200, "Membership requested", id);
    });
}

app.http("groupJoin", {
    methods: ["POST"],
    route: "group/{group_id}/join",
    authLevel: "anonymous",
    handler: groupJoin,
});
