import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withTeam, get, push, reply } from "../services/teamActions";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doEnsureRoundUsers } from "../services/doSyncTeam";
import { isTeamAdmin } from "../services/teamRelations";

export async function teamAccept(request: HttpRequest, context: InvocationContext) {
    return withTeam(request, context, async ({ teamId, team, mine, data }) => {
        if (team.state !== "active") return reply(409, "The team must be active");
        if (!isTeamAdmin(mine)) return reply(403, "Only a team administrator can do this");
        const user = data.user_id;
        if (typeof user !== "string" || !user.startsWith("user_"))
            return reply(400, "user_id is required");
        const membership = await get(teamId, user);
        if (membership?.role === "is_member") {
            await doEnsureRoundUsers(teamId);
            await doGuidsToPublic();
            return reply(
                200,
                "Player already accepted; round links refreshed",
            );
        }
        if (
            membership?.state !== "pending" ||
            !(await get("user", user))
        )
            return reply(
                409,
                "The player must have a pending membership request",
            );
        await doUpsertRelation(teamId, user, { role: "is_member" });
        await doEnsureRoundUsers(teamId);
        await doGuidsToPublic();
        await push(
            [user],
            String(team.name),
            "Your team membership has been approved",
            `team/${teamId}`,
            context,
        );
        return reply(200, "Player accepted", undefined, teamId);
    });
}

app.http("teamaccept", {
    methods: ["POST"],
    route: "team/accept",
    authLevel: "anonymous",
    handler: teamAccept,
});

app.http("teamByIdaccept", {
    methods: ["POST"],
    route: "team/{team_id}/accept",
    authLevel: "anonymous",
    handler: teamAccept,
});
