import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withOpenComp, entrantRows, props, reply, saveMembership } from "../services/compActions";

export async function compSeed(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, true, async ({ id, elim, data, members }) => {
        const entrants = entrantRows(elim, members);
        const member = entrants.find(row => row.rowKey === (elim.format === "doubles" ? data.pair_id : data.user_id));
        if (member?.is_participant !== true)
            return reply(409, "This player is not an accepted entrant");
        const seeds = entrants.filter(row => Number(row.seed) > 0);
        const rank = Number(member.seed ?? 0);
        if (!rank && seeds.length >= 8) return reply(409, "All eight seeds are assigned");
        await saveMembership(id, new Map([[member.rowKey, { ...props(member), seed: rank || seeds.length + 1 }]]));
        return reply(200, "Seed assigned", id);
    });
}

app.http("compSeed", {
    methods: ["POST"],
    route: "comp/{comp_id}/seed",
    authLevel: "anonymous",
    handler: compSeed,
});
