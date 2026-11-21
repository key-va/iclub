import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withOpenComp, notify, props, reply, saveMembership } from "../services/compActions";

export async function compAccept(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, true, async ({ id, elim, caller, data, members }) => {
        const member = members.find(row => row.rowKey === data.user_id);
        if (!member || (member.state !== "pending" && member.is_participant !== true))
            return reply(409, "This player has no pending request");
        await saveMembership(id, new Map([[member.rowKey, { ...props(member), state: "accepted", is_participant: true }]]));
        if (member.state === "pending")
            await notify(context, [member.rowKey], caller, String(elim.name), "Join request accepted", `comp/${id}`, id);
        return reply(200, "Join request accepted", id);
    });
}

app.http("compAccept", {
    methods: ["POST"],
    route: "comp/{comp_id}/accept",
    authLevel: "anonymous",
    handler: compAccept,
});
