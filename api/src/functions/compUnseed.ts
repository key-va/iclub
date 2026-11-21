import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withOpenComp, clearSeed, reply, saveMembership } from "../services/compActions";

export async function compUnseed(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, true, async ({ id, data, members }) => {
        const member = members.find(row => row.rowKey === data.user_id);
        if (member?.is_participant !== true)
            return reply(409, "This player is not an accepted entrant");
        await saveMembership(id, clearSeed(members, member));
        return reply(200, "Seed removed", id);
    });
}

app.http("compUnseed", {
    methods: ["POST"],
    route: "comp/{comp_id}/unseed",
    authLevel: "anonymous",
    handler: compUnseed,
});
