import type { HttpRequest, InvocationContext } from "@azure/functions";
import { odata } from "@azure/data-tables";
import { client, get, relations, reply, signedEntityRequest } from "./clubEntityRequests";
import { deleteIfPresent, sendRejection, updateIfCurrent } from "./joinRejection";
import { doGuidsToPublic } from "./doGuidsToPublic";
import { withTeam } from "./teamActions";

type EntityType = "ladder" | "group" | "comp" | "team";
type Row = NonNullable<Awaited<ReturnType<typeof get>>>;

async function reject(
    type: EntityType, id: string, entity: Row, clubId: string | undefined,
    admins: string[], caller: string, context: InvocationContext,
) {
    if (entity.state !== "pending" && entity.state !== "rejected")
        return reply(409, `Only a pending ${type} can be rejected`);

    const club = typeof entity.rejection_club === "string" ? entity.rejection_club : clubId;
    if (!club || (await get(club, caller))?.is_admin !== true)
        return reply(403, `Only a club admin can reject this ${type}`);
    const recipients = typeof entity.rejection_recipients === "string"
        ? entity.rejection_recipients.split(",").filter(Boolean) : admins;

    // Store authorization and notification context until cleanup finishes.
    if (entity.rejection_club === undefined &&
        !(await updateIfCurrent(entity, {
            state: "rejected", rejection_club: club, rejection_recipients: recipients.join(","),
        })))
        return reply(409, "This creation request has already changed");

    const related = await relations(id);
    for await (const row of client.listEntities({ queryOptions: { filter: odata`RowKey eq ${id}` } })) {
        if (row.partitionKey !== type && row.partitionKey !== id) related.push(row);
    }
    for (const row of related) await deleteIfPresent(row.partitionKey, row.rowKey);
    const current = await get(type, id);
    if (current?.state !== "rejected" || !(await deleteIfPresent(type, id, current.etag)))
        return reply(409, "This creation request has already changed");
    await doGuidsToPublic();
    await sendRejection(
        id, String(entity.name), recipients,
        `Your pending request to create ${entity.name} was rejected. Please review the club rules or reach out to your club admin.`,
        context, caller, "about",
    );
    return reply(200, "Creation request rejected", caller);
}

export async function rejectCreation(request: HttpRequest, context: InvocationContext, type: EntityType) {
    if (type === "team") {
        return withTeam(request, context, async ({ teamId, team, graph, caller_id }) =>
            reject(type, teamId, team, graph.clubId, graph.administrators, caller_id, context));
    }

    const signed = await signedEntityRequest(request, context, type);
    if ("status" in signed) return signed;
    const id = request.params[`${type}_id`];
    if (!id?.startsWith(`${type}_`)) return reply(400, `${type}_id is required`);
    const entity = await get(type, id);
    if (!entity) return reply(404, "Entity not found");
    const links = await relations(id);
    const clubs = links.filter(row => row.rowKey.startsWith("club_"));
    const admins = links.filter(row => row.rowKey.startsWith("user_") && row.is_admin === true);
    return reject(type, id, entity, clubs.length === 1 ? clubs[0].rowKey : undefined,
        admins.map(row => row.rowKey), signed.caller_id, context);
}
