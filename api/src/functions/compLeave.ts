import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withOpenComp, clearSeed, entrantRows, entryUsers, props, reply, saveMembership } from "../services/compActions";

export async function compLeave(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, false, async ({ id, elim, caller, mine, members }) => {
        if (!mine) return reply(409, "This player is not an accepted entrant");
        if (elim.format === "doubles" && mine.is_participant === true) {
            const entrants = entrantRows(elim, members);
            for (const pair of entrants) {
                const users = await entryUsers(pair.rowKey);
                if (!users.includes(caller)) continue;
                const changes = clearSeed(entrants, pair, { state: "left", is_participant: false });
                for (const member of members.filter(row => users.includes(row.rowKey))) {
                    changes.set(member.rowKey, {
                        ...props(member), state: member.rowKey === caller ? "left" : "pending", is_participant: false,
                    });
                }
                await saveMembership(id, changes);
                return reply(200, "Pair withdrawn", id);
            }
            return reply(409, "Your doubles pair could not be found");
        }
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
