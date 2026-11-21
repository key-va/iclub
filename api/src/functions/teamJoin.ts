import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withTeam, get, push, relations, reply } from "../services/teamActions";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { isTeamAdmin } from "../services/teamRelations";

export async function teamJoin(request: HttpRequest, context: InvocationContext) {
    return withTeam(request, context, async ({ teamId, team, caller_id, mine }) => {
        if (team.state !== "active") return reply(409, "The team must be active");
        const requester = caller_id.startsWith("user_")
            ? await get("user", caller_id)
            : undefined;
        if (!requester) return reply(403, "A user account is required");
        if (mine && mine.state !== "left")
            return reply(
                409,
                "You already belong to this team or have a pending request",
            );
        await doUpsertRelation(teamId, caller_id, { state: "pending" });
        await doGuidsToPublic();
        await push(
            (await relations(teamId))
                .filter(isTeamAdmin)
                .map((r) => r.rowKey),
            String(team.name),
            `${requester.name || "A player"} has requested to join`,
            `team/${teamId}`,
            context,
        );
        return reply(200, "Membership requested", undefined, teamId);
    });
}

app.http("teamjoin", {
    methods: ["POST"],
    route: "team/join",
    authLevel: "anonymous",
    handler: teamJoin,
});

app.http("teamByIdjoin", {
    methods: ["POST"],
    route: "team/{team_id}/join",
    authLevel: "anonymous",
    handler: teamJoin,
});
