import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectJoin } from "../services/joinRejection";
import { get, reply, withTeam } from "../services/teamActions";
import { isTeamAdmin } from "../services/teamRelations";

export async function teamReject(request: HttpRequest, context: InvocationContext) {
    return withTeam(request, context, async ({ teamId, team, mine, data }) => {
        if (team.state !== "active") return reply(409, "The team must be active");
        if (!isTeamAdmin(mine)) return reply(403, "Only a team admin can reject a join request");
        const user = data.user_id;
        return rejectJoin(teamId, team, user, typeof user === "string" ? await get(teamId, user) : undefined, context);
    });
}

app.http("teamReject", {
    methods: ["POST"],
    route: "team/{team_id}/reject",
    authLevel: "anonymous",
    handler: teamReject,
});
