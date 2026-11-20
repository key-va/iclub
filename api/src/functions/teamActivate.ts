import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withTeam, get, push, reply } from "../services/teamActions";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doSyncTeam, teamMapping } from "../services/doSyncTeam";
import { providerFor } from "../services/trols";
import { teamAttributes } from "../services/competitionData";
import { migrateTeamRelations } from "../services/teamRelations";

export async function teamActivate(request: HttpRequest, context: InvocationContext) {
    return withTeam(request, context, async ({ teamId, graph, team, caller_id }) => {
        const clubAdmin = graph.clubId
            ? await get(graph.clubId, caller_id)
            : undefined;
        if (clubAdmin?.is_admin !== true)
            return reply(
                403,
                "Only the associated club administrator can activate this team",
            );
        if (
            team.state !== "pending" &&
            !(team.state === "active" && !team.last_synced)
        )
            return reply(409, "Only a pending team can be activated");
        if (!graph.administrators.length)
            return reply(409, "Team request has no administrator");
        // A failed external fetch leaves approval pending, with no imported records.
        let snapshot;
        try {
            snapshot = await providerFor(
                teamMapping(team).provider,
            ).snapshot(teamMapping(team));
        } catch (error) {
            context.warn("Initial team synchronisation failed", error);
            return reply(
                502,
                "TROLS could not be loaded; the team is still pending. Retry approval.",
            );
        }
        await migrateTeamRelations(graph);
        await doUpsertEntity("team", teamId, {
            ...teamAttributes(team),
            state: "active",
        });
        const summary = await doSyncTeam(teamId, snapshot);
        await push(
            graph.administrators,
            String(team.name),
            "Your team is approved and active",
            `team/${teamId}`,
            context,
        );
        return reply(200, "Team activated", summary, teamId);
    });
}

app.http("teamactivate", {
    methods: ["POST"],
    route: "team/activate",
    authLevel: "anonymous",
    handler: teamActivate,
});

app.http("teamByIdactivate", {
    methods: ["POST"],
    route: "team/{team_id}/activate",
    authLevel: "anonymous",
    handler: teamActivate,
});
