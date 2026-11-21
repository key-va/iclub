import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { get, locked, push, relations, reply } from "../services/teamActions";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { isTeamAdmin, isTeamMember } from "../services/teamRelations";

export async function roundRole(
    request: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return reply(400, "Invalid JSON payload");
    }
    const { caller_id, device_id, signature, data = {} } = body ?? {};
    if (
        typeof caller_id !== "string" ||
        !caller_id ||
        !signature ||
        (!device_id && !caller_id.startsWith("bot_"))
    )
        return reply(400, "Caller credentials are required");
    try {
        await doSignatureVerification(
            {
                callerId: caller_id,
                deviceId: device_id,
                url: request.url,
                signature,
            },
            context,
        );
    } catch {
        return reply(401, "Unauthorised");
    }
    if (!data || typeof data !== "object") return reply(400, "Invalid data");
    const id = request.params.round_id ?? data.round_id;
    const user = data.user_id ?? caller_id;
    const role = data.role;
    if (
        typeof id !== "string" ||
        !id.startsWith("round_") ||
        typeof user !== "string" ||
        !user.startsWith("user_") ||
        !["pending", "available", "unavailable", "selected"].includes(role)
    )
        return reply(400, "Valid round_id, user_id and role are required");
    try {
        const round = await get("round", id);
        if (!round) return reply(404, "Round not found");
        const owners = (await relations(id)).filter((relation) =>
            relation.rowKey.startsWith("team_"),
        );
        if (owners.length !== 1)
            return reply(409, "Round must belong to exactly one team");
        const teamId = owners[0].rowKey;
        return await locked(teamId, async () => {
            const team = await get("team", teamId);
            if (team?.state !== "active" || !(await get(teamId, id)))
                return reply(409, "Round must belong to an active team");
            const currentRound = await get("round", id);
            if (!currentRound) return reply(404, "Round not found");
            if (currentRound.state === "eliminated")
                return reply(409, "An eliminated round cannot be changed");
            if (
                currentRound.state === "complete" ||
                (currentRound.state === undefined &&
                    ["completed", "bye", "washout"].includes(String(currentRound.status)))
            )
                return reply(409, "A completed round cannot be changed");
            const membership = await get(teamId, user);
            const caller = await get(teamId, caller_id);
            const previous = await get(id, user);
            if (!isTeamMember(membership) || !previous)
                return reply(
                    403,
                    "Only approved team players have round roles",
                );
            const old = previous.role;
            if (role === "selected") {
                if (!isTeamAdmin(caller))
                    return reply(
                        403,
                        "Only an administrator can select a player",
                    );
                if (old !== "available" && old !== "selected")
                    return reply(409, "Only available players can be selected");
            } else if (old === "selected" && role === "available") {
                if (!isTeamAdmin(caller))
                    return reply(403, "Only an administrator can return a selected player to available");
            } else if (user !== caller_id)
                return reply(403, "You may only update your own availability");
            if (old === role) {
                await doUpsertRelation(id, user, { role });
                await doGuidsToPublic();
                return reply(200, "Role unchanged");
            }
            if (
                role !== "selected" &&
                (!["available", "unavailable"].includes(role) ||
                    !["pending", "available", "unavailable", "selected"].includes(
                        String(old),
                    ) ||
                    (old === "selected" && role !== "unavailable" && role !== "available"))
            )
                return reply(409, "This round role transition is not allowed");
            const unavailablePlayer =
                old === "selected" && role === "unavailable"
                    ? await get("user", user)
                    : undefined;
            await doUpsertRelation(id, user, { role });
            await doGuidsToPublic();
            const roundName =
                currentRound.ext_stage ??
                `Round ${currentRound.ext_number ?? currentRound.number}`;
            if (old === "selected" && role === "unavailable")
                await push(
                    (await relations(teamId))
                        .filter(
                            (r) =>
                                r.rowKey.startsWith("user_") && isTeamAdmin(r),
                        )
                        .map((r) => r.rowKey),
                    `Player unavailable — ${team.name}`,
                    `${unavailablePlayer?.name || "A player"} is now unavailable for ${roundName}. A replacement player is needed.`,
                    `round/${id}`,
                    context,
                );
            else if (role === "selected")
                await push(
                    [user],
                    String(team.name),
                    `You have been selected for ${roundName}.`,
                    `round/${id}`,
                    context,
                );
            return reply(200, "Round role updated", undefined, id);
        });
    } catch (error: any) {
        context.error("Round role update failed", error);
        return reply(
            error.statusCode === 409 ? 409 : 503,
            error.statusCode === 409
                ? error.message
                : "Role update could not be completed; refresh and retry",
        );
    }
}
app.http("roundRole", {
    methods: ["POST"],
    route: "round/role",
    authLevel: "anonymous",
    handler: roundRole,
});
app.http("roundByIdRole", {
    methods: ["POST"],
    route: "round/{round_id}/role",
    authLevel: "anonymous",
    handler: roundRole,
});
