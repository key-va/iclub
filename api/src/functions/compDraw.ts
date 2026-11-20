import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { withComp, client, get, migrateComp, mirrorUser, props, repairResult, reply, startDraw } from "../services/compActions";

export async function compDraw(request: HttpRequest, context: InvocationContext) {
    return withComp(request, context, async ({ id, elim, admin, members, renewGuard }) => {
        if (!admin) return reply(403, "Only a competition admin can do this");
        await migrateComp(elim, renewGuard);
        const entrants = members.filter(row => row.is_participant === true);
        if (elim.state === "active" || elim.state === "complete") {
            const current = await get("comp", id);
            if (typeof current?.pending_result === "string")
                await repairResult(id, JSON.parse(current.pending_result), context);
            await doGuidsToPublic();
            return reply(200, "Draw already started", id);
        }
        if (entrants.length < 2) return reply(400, "At least two accepted entrants are required");
        if (elim.state === "drawing" && elim.draw_version !== 1)
            return reply(409, "This draw version is unavailable");
        await client.updateEntity({
            partitionKey: "comp", rowKey: id, state: "drawing", draw_version: 1,
        }, "Merge");
        for (const member of members) {
            await renewGuard();
            if (member.state === "pending" || member.state === "closed")
                await doUpsertRelation(id, member.rowKey, { ...props(member), state: "closed" });
            else
                await mirrorUser(member);
        }
        await startDraw(elim, entrants, renewGuard);
        await doGuidsToPublic();
        return reply(200, "Draw started", id);
    });
}

app.http("compDraw", {
    methods: ["POST"],
    route: "comp/{comp_id}/draw",
    authLevel: "anonymous",
    handler: compDraw,
});
