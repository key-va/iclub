import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withTeam, reply } from "../services/teamActions";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { isTeamAdmin } from "../services/teamRelations";

export async function teamUpdate(request: HttpRequest, context: InvocationContext) {
    return withTeam(request, context, async ({ teamId, team, data, mine }) => {
        if (!isTeamAdmin(mine))
            return reply(403, "Only a team admin can edit this team");
        if (team.state !== "active" && team.state !== "pending")
            return reply(409, "This team cannot be edited");
        if (Object.keys(data).some((key) => !["image", "team_id"].includes(key)))
            return reply(400, "Only the team icon can be updated");
        if (typeof data.image !== "string")
            return reply(400, "Supply a JPEG icon of 1MB or less");
        const image = Buffer.from(
            data.image.replace(/^data:image\/jpe?g;base64,/i, ""),
            "base64",
        );
        if (
            !image.length || image.length > 1024 * 1024 ||
            image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff
        )
            return reply(400, "Icon must be a JPEG of 1MB or less");
        await doAssetToPublic(image, `${teamId}.jpg`);
        await doGuidsToPublic();
        return reply(200, "Team icon updated", undefined, teamId);
    });
}

app.http("teamupdate", {
    methods: ["POST"],
    route: "team/update",
    authLevel: "anonymous",
    handler: teamUpdate,
});

app.http("teamByIdupdate", {
    methods: ["POST"],
    route: "team/{team_id}/update",
    authLevel: "anonymous",
    handler: teamUpdate,
});
