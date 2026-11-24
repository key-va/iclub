import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { client, get, reply, withGroup } from "../services/clubEntityRequests";
import { pendingApplicant, updateIfCurrent } from "../services/joinRejection";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

export async function groupAccept(request: HttpRequest, context: InvocationContext) {
    return withGroup(request, context, async ({ id, group, mine, links, data, notify }) => {
        if (group.state !== "active") return reply(409, "The group must be active");
        if (mine?.is_admin !== true)
            return reply(403, "Only a group admin can accept a player");
        const userId = data.user_id;
        if (
            typeof userId !== "string" ||
            !userId.startsWith("user_") ||
            !(await get("user", userId))
        )
            return reply(400, "A valid user_id is required");
        const applicant = links.find((row) => row.rowKey === userId);
        if (!pendingApplicant(applicant))
            return reply(409, "This player has no pending request");
        const { partitionKey, rowKey, etag, timestamp, state, ...attributes } =
            applicant;
        const membership = { ...attributes, is_participant: true };
        if (!(await updateIfCurrent(applicant, membership, "Replace")))
            return reply(409, "This join request has already changed");
        await client.upsertEntity({ partitionKey: userId, rowKey: id, ...membership }, "Replace");
        await doGuidsToPublic();
        await notify(
            [userId],
            String(group.name),
            "Your request to join has been accepted",
            id,
        );
        return reply(200, "Player accepted");
    });
}

app.http("groupAccept", {
    methods: ["POST"],
    route: "group/{group_id}/accept",
    authLevel: "anonymous",
    handler: groupAccept,
});
