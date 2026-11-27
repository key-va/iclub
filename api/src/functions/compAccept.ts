import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { notificationName } from "../services/notificationName";
import { client, withOpenComp, entryUsers, get, notify, prepareCompPair, props, reply, saveMembership } from "../services/compActions";

export async function compAccept(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, true, async ({ id, elim, caller, data, members }) => {
        if (elim.format === "doubles") {
            const ids = data.user_ids;
            if (!Array.isArray(ids) || ids.length !== 2 || new Set(ids).size !== 2 ||
                !ids.every((id): id is string => typeof id === "string" && id.startsWith("user_")))
                return reply(400, "Select two distinct pending players");

            // The competition partition commits the two requests and pair entry together.
            for (const pair of members.filter(row => row.rowKey.startsWith("pair_") && row.is_participant === true)) {
                const partners = await entryUsers(pair.rowKey);
                if (ids.every(id => partners.includes(id))) {
                    await saveMembership(id, new Map([[pair.rowKey, props(pair)]]));
                    return reply(200, "Pair already accepted", id);
                }
            }
            const requests = members.filter(row => ids.includes(row.rowKey));
            if (requests.length !== 2 || requests.some(row => row.state !== "pending" || row.is_participant === true))
                return reply(409, "Both players must have pending requests");
            if ((await Promise.all(ids.map(id => get("user", id)))).some(user => !user))
                return reply(404, "Player not found");
            const pairId = await prepareCompPair(id, ids);
            const changes = new Map<string, Record<string, unknown>>(
                requests.map(row => [row.rowKey, { ...props(row), state: "accepted", is_participant: true }])
            );
            changes.set(pairId, { state: "accepted", is_participant: true });
            await saveMembership(id, changes);
            await notify(context, ids, undefined, String(elim.name), `Your doubles pair ${await notificationName(client, pairId)} has been accepted`, `comp/${id}`, id);
            return reply(200, "Pair accepted", id);
        }
        const member = members.find(row => row.rowKey.startsWith("user_") && row.rowKey === data.user_id);
        if (!member || (member.state !== "pending" && member.is_participant !== true))
            return reply(409, "This player has no pending request");
        await saveMembership(id, new Map([[member.rowKey, { ...props(member), state: "accepted", is_participant: true }]]));
        if (member.state === "pending")
            await notify(context, [member.rowKey], caller, String(elim.name), "Join request accepted. Ready up!", `comp/${id}`, id);
        return reply(200, "Join request accepted", id);
    });
}

app.http("compAccept", {
    methods: ["POST"],
    route: "comp/{comp_id}/accept",
    authLevel: "anonymous",
    handler: compAccept,
});
