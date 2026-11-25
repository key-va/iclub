import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withOpenComp, notify, props, reply, saveMembership } from "../services/compActions";

export async function compJoin(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, false, async ({ id, elim, caller, user, mine, members }) => {
        if (mine?.is_participant === true) return reply(409, "You have already joined");
        if (mine?.state === "rejecting") return reply(409, "Your previous request is being cleared");
        const attributes = mine ? props(mine) : {};
        await saveMembership(id, new Map([[caller, { ...attributes, state: "pending", is_participant: false }]]));
        const admins = members.filter(row => row.is_admin === true).map(row => row.rowKey);
        if (admins.length)
            await notify(context, admins, caller, String(elim.name), `${user.name ?? "A player"} has requested to join`, `comp/${id}`, id);
        return reply(200, "Join requested", id);
    });
}

app.http("compJoin", {
    methods: ["POST"],
    route: "comp/{comp_id}/join",
    authLevel: "anonymous",
    handler: compJoin,
});
