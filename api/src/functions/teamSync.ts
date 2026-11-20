import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withTeam, reply } from "../services/teamActions";
import { doSyncTeam } from "../services/doSyncTeam";
import { isTeamMember } from "../services/teamRelations";

export async function teamSync(request: HttpRequest, context: InvocationContext) {
    return withTeam(request, context, async ({ teamId, team, mine }) => {
        if (team.state !== "active") return reply(409, "The team must be active");
        if (!isTeamMember(mine)) return reply(403, "Only approved team members can refresh data");
        try {
            const summary = await doSyncTeam(teamId);
            return reply(
                200,
                `Refreshed: ${summary.created} created, ${summary.updated} updated`,
                summary,
            );
        } catch (error) {
            context.warn("Team synchronisation failed", error);
            return reply(
                502,
                "Synchronisation failed. Refresh the page and retry; your player roles and messages are preserved.",
            );
        }
    });
}

app.http("teamsync", {
    methods: ["POST"],
    route: "team/sync",
    authLevel: "anonymous",
    handler: teamSync,
});

app.http("teamByIdsync", {
    methods: ["POST"],
    route: "team/{team_id}/sync",
    authLevel: "anonymous",
    handler: teamSync,
});
