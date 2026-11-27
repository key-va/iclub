import { notificationName } from "../services/notificationName";
import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { client, get, relations, reply } from "../services/clubEntityRequests";
import { doCompetitorUsers } from "../services/doCompetitorUsers";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { updateIfCurrent } from "../services/joinRejection";
import { doSendPush } from "../services/doSendPush";
import { doSignatureVerification } from "../services/doSignatureVerification";

export async function matchWithdraw(request: HttpRequest, context: InvocationContext) {
    const id = request.params.match_id;
    if (!id?.startsWith("match_")) return reply(400, "match_id is required");
    let body;
    try {
        body = await request.json() as { caller_id?: string; device_id?: string; signature?: string };
    } catch {
        return reply(400, "Invalid JSON payload");
    }
    const { caller_id, device_id, signature } = body ?? {};
    if (typeof caller_id !== "string" || !caller_id || !signature || (!device_id && !caller_id.startsWith("bot_")))
        return reply(400, "Caller credentials are required");
    try {
        await doSignatureVerification({ callerId: caller_id, deviceId: device_id, url: request.url, signature }, context);
    } catch {
        return reply(401, "Unauthorised");
    }

    const match = await get("match", id);
    if (!match) return reply(404, "Match not found");
    const links = await relations(id);
    const ladder = links.find(row => row.rowKey.startsWith("ladder_"))?.rowKey;
    const challenger = links.find(row => row.role === "challenger")?.rowKey;
    const defender = links.find(row => row.role === "defender")?.rowKey;
    if (!ladder || !challenger || !defender)
        return reply(409, "Only ladder challenges can be withdrawn");
    const challengers = await doCompetitorUsers(client, challenger);
    if (!challengers.includes(caller_id)) return reply(403, "Only the challenger can withdraw");

    if (match.state === "pending" || (match.state === "withdrawing" && !match.withdraw_challenger_etag)) {
        const [first, second] = await Promise.all([get(ladder, challenger), get(ladder, defender)]);
        if (!first || !second) return reply(409, "Both players must be on the ladder");
        // Keep the reservation versions so a retry cannot release a player's later match.
        if (!(await updateIfCurrent(match, {
            state: "withdrawing",
            withdraw_challenger_etag: first.etag,
            withdraw_defender_etag: second.etag,
        }))) return reply(409, "The challenge has already changed");
    } else if (match.state !== "withdrawing" && match.state !== "withdrawn") {
        return reply(409, "Only pending challenges can be withdrawn");
    }

    const current = await get("match", id);
    if (current?.state === "withdrawing") {
        for (const [player, etag] of [
            [challenger, current.withdraw_challenger_etag],
            [defender, current.withdraw_defender_etag],
        ] as const) {
            const mirror = await get(player, ladder);
            const reservation = await get(ladder, player);
            if (reservation?.etag !== etag || reservation?.state !== "busy") continue;
            if (mirror?.state === "busy" && !(await updateIfCurrent(mirror, { state: "active" })))
                return reply(409, "The ladder changed. Retry withdrawal.");
            if (!(await updateIfCurrent(reservation, { state: "active" })))
                return reply(409, "The ladder changed. Retry withdrawal.");
        }
        const { partitionKey, rowKey, timestamp, etag, withdraw_challenger_etag, withdraw_defender_etag, ...attributes } = current;
        if (await updateIfCurrent(current, { ...attributes, state: "withdrawn" }, "Replace")) {
            await doGuidsToPublic();
            await doSendPush({
                userIds: await doCompetitorUsers(client, defender),
                heading: String(match.name),
                content: `${await notificationName(client, caller_id)} withdrew their challenge`,
                path: `match/${id}`,
                collapseId: id,
            }, context);
            return reply(200, "Challenge withdrawn", id);
        }
    }
    if ((await get("match", id))?.state !== "withdrawn") return reply(409, "Retry withdrawal");
    await doGuidsToPublic();
    return reply(200, "Challenge withdrawn", id);
}

app.http("matchWithdraw", {
    methods: ["POST"],
    route: "match/{match_id}/withdraw",
    authLevel: "anonymous",
    handler: matchWithdraw,
});
