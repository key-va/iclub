import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withOpenComp, clearSeed, reply, saveMembership } from "../services/compActions";

export async function compLeave(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, false, async ({ id, mine, members }) => {
        if (!mine) return reply(409, "This player is not an accepted entrant");
        await saveMembership(id, clearSeed(members, mine, { state: "left", is_participant: false }));
        return reply(200, "Entry withdrawn", id);
    });
}

app.http("compLeave", {
    methods: ["POST"],
    route: "comp/{comp_id}/leave",
    authLevel: "anonymous",
    handler: compLeave,
});
