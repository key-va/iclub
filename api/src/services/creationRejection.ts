import type { HttpRequest, InvocationContext } from "@azure/functions";
import { get, relations, reply, signedEntityRequest } from "./clubEntityRequests";
import { sendRejection, updateIfCurrent } from "./joinRejection";
import { doGuidsToPublic } from "./doGuidsToPublic";
import { withTeam } from "./teamActions";

type EntityType = "ladder" | "group" | "comp" | "team";
type Row = NonNullable<Awaited<ReturnType<typeof get>>>;

async function reject(
    type: EntityType, id: string, entity: Row, admins: string[],
    caller: string, context: InvocationContext,
) {
    if (entity.state !== "pending") return reply(409, `Only a pending ${type} can be rejected`);
    if (!(await updateIfCurrent(entity, { state: "rejected" })))
        return reply(409, "This creation request has already changed");
    await doGuidsToPublic();
    await sendRejection(
        id, String(entity.name), admins,
        `your pending request to create ${entity.name} was rejected, please review the club rules or reach out to your club admin`,
        context, caller,
    );
    return reply(200, "Creation request rejected", id);
}

export async function rejectCreation(request: HttpRequest, context: InvocationContext, type: EntityType) {
    if (type === "team") {
        return withTeam(request, context, async ({ teamId, team, graph, caller_id }) => {
            if (!graph.clubId || (await get(graph.clubId, caller_id))?.is_admin !== true)
                return reply(403, "Only a club admin can reject this team");
            return reject(type, teamId, team, graph.administrators, caller_id, context);
        });
    }

    const signed = await signedEntityRequest(request, context, type);
    if ("status" in signed) return signed;
    const id = request.params[`${type}_id`];
    if (!id?.startsWith(`${type}_`)) return reply(400, `${type}_id is required`);
    const entity = await get(type, id);
    if (!entity) return reply(404, "Entity not found");
    const links = await relations(id);
    const clubs = links.filter(row => row.rowKey.startsWith("club_"));
    if (clubs.length !== 1 || (await get(clubs[0].rowKey, signed.caller_id))?.is_admin !== true)
        return reply(403, `Only a club admin can reject this ${type}`);
    const admins = links.filter(row => row.rowKey.startsWith("user_") && row.is_admin === true);
    return reject(type, id, entity, admins.map(row => row.rowKey), signed.caller_id, context);
}
