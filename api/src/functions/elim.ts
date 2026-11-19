import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, TransactionAction, odata } from "@azure/data-tables";
import { resourceName, resourceSuffix } from "../stores/resourceNames";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doSendPush } from "../services/doSendPush";
import { elimBracketId, elimDraw, elimRoundName } from "../services/elimDraw";
import { groupAction } from "./group";

const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);

const reply = (status: number, message: string, subject?: string): HttpResponseInit => ({
    status,
    jsonBody: { success: status < 400, message, ...(subject ? { subject } : {}) },
});

function hasStatus(error: unknown, code: number) {
    return (error as { statusCode?: number } | null)?.statusCode === code;
}

type Row = Record<string, unknown> & {
    partitionKey: string;
    rowKey: string;
    etag?: string;
    timestamp?: string;
};

async function get(pk: string, rk: string): Promise<Row | undefined> {
    try {
        return { ...await client.getEntity(pk, rk), partitionKey: pk, rowKey: rk };
    } catch (error) {
        if (!hasStatus(error, 404)) throw error;
        return undefined;
    }
}

async function users(id: string) {
    const rows = [];
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${id}` },
    })) {
        if (row.rowKey.startsWith("user_")) rows.push(row);
    }
    return rows;
}

function props(row: Row) {
    const { partitionKey, rowKey, etag, timestamp, ...attributes } = row;
    return attributes;
}

async function mirrorUser(row: Row) {
    await doUpsertEntity(row.rowKey, row.partitionKey, props(row));
}

async function remove(pk: string, rk: string) {
    try {
        await client.deleteEntity(pk, rk);
    } catch (error) {
        if (!hasStatus(error, 404)) throw error;
    }
}

async function notify(
    context: InvocationContext, userIds: string[], exceptUserId: string | undefined,
    name: string, content: string, path: string, id: string,
) {
    try {
        await doSendPush({
            userIds, exceptUserId, heading: name, content, path, collapseId: id,
        }, context);
    } catch (error) {
        context.warn("Elim push delivery failed", error);
    }
}

function matchProperties(rounds: number, round: number, position: number) {
    const label = elimRoundName(rounds - round + 1, round);
    return {
        label: round === rounds ? label : `${label} match ${position}`,
        bracket_round: round,
        bracket_match: position,
    };
}

async function projectMatch(match: Record<string, unknown> & { rowKey: string }, first: string, second: string) {
    const id = match.rowKey;
    const players = [first, second].filter(Boolean);
    for (const previous of await users(id)) {
        if (!players.includes(previous.rowKey)) {
            await remove(previous.rowKey, id);
            await remove(id, previous.rowKey);
        }
    }

    const winner = String(match.winner_id ?? "");
    for (const userId of players) {
        const isFirst = userId === first;
        const score = isFirst ? match.first_score : match.second_score;
        await doUpsertRelation(id, userId, {
            role: isFirst ? "challenger" : "defender",
            ...(winner ? { result: match.is_bye ? "bye" : winner === userId ? "winner" : "loser" } : {}),
            ...(typeof score === "number" ? { score } : {}),
        });
    }
    let name = String(match.label);
    if (players.length) {
        const names = await Promise.all(players.map(async userId =>
            String((await get("user", userId))?.name ?? "Player")
        ));
        name += match.is_bye ? ` · ${names[0]} (bye)` : ` · ${names.join(" vs ")}`;
    }
    await client.updateEntity({
        partitionKey: "match", rowKey: id, name,
        first_id: first, second_id: second, draw_ready: true,
        state: match.is_bye ? "bye" : winner ? "complete" : second && first ? "active" : "waiting",
    }, "Merge");
}

async function startDraw(elim: Row, entrants: Row[], renewGuard: () => Promise<void>) {
    const id = elim.rowKey;
    const { rounds, slots } = elimDraw(id, entrants.map(row => ({
        id: row.rowKey, seed: Number(row.seed ?? 0),
    })));
    const winners = new Map<string, string>();
    for (let round = 1; round <= rounds; round++) {
        const roundId = elimBracketId("round", id, round);
        const positions = 2 ** (rounds - round);
        await doUpsertEntity("round", roundId, {
            name: elimRoundName(rounds - round + 1, round), bracket_round: round,
        });
        await doUpsertRelation(id, roundId);
        for (let position = 1; position <= positions; position++) {
            await renewGuard();
            const matchId = elimBracketId("match", id, round, position);
            const attributes = matchProperties(rounds, round, position);
            const [first, second] = round === 1
                ? [slots[2 * position - 2], slots[2 * position - 1]]
                : [2 * position - 1, 2 * position].map(feeder =>
                    winners.get(elimBracketId("match", id, round - 1, feeder)) ?? "");
            const bye = round === 1 && (!first || !second);
            const winner = bye ? first || second : "";
            if (winner) winners.set(matchId, winner);
            // A ready row is written only after its links are in place. A retry
            // can skip completed positions while retaining the same bye winners.
            if ((await get("match", matchId))?.draw_ready === true) continue;
            const fields = {
                ...attributes, name: attributes.label, is_bye: bye, winner_id: winner,
                first_id: first, second_id: second, state: "waiting",
            };
            await doUpsertEntity("match", matchId, fields);
            await doUpsertRelation(id, matchId);
            await doUpsertRelation(roundId, matchId);
            await projectMatch({ rowKey: matchId, ...fields }, first, second);
        }
    }
    await client.updateEntity({
        partitionKey: "elim", rowKey: id, state: "active", rounds,
    }, "Merge");
}

async function finishResult(elim: Row, match: Row) {
    const id = elim.rowKey;
    const round = Number(match.bracket_round);
    const position = Number(match.bracket_match);
    await projectMatch(match, String(match.first_id), String(match.second_id));
    if (round === elim.rounds) {
        await client.updateEntity({
            partitionKey: "elim", rowKey: id, state: "complete",
            champion_id: String(match.winner_id),
        }, "Merge");
    } else {
        const nextPosition = Math.ceil(position / 2);
        const next = await get("match", elimBracketId("match", id, round + 1, nextPosition));
        if (!next) throw new Error("Next match is missing");
        const feeders = await Promise.all(
            [2 * nextPosition - 1, 2 * nextPosition].map(feeder =>
                get("match", elimBracketId("match", id, round, feeder)))
        );
        await projectMatch(next, String(feeders[0]?.winner_id ?? ""), String(feeders[1]?.winner_id ?? ""));
    }
}

async function score(
    elim: Row, matchId: string, caller: string, admin: boolean,
    action: string, data: Record<string, unknown>, context: InvocationContext,
) {
    const id = elim.rowKey;
    if (!["active", "complete"].includes(String(elim.state)))
        return reply(409, "The draw has to be ready before scoring");
    if (!matchId.startsWith("match_") || !(await get(id, matchId)))
        return reply(404, "Elim match not found");
    const match = await get("match", matchId);
    if (!match) return reply(404, "Elim match not found");
    const first = String(match.first_id ?? "");
    const second = String(match.second_id ?? "");
    if (action !== "score" && !admin)
        return reply(403, "Only an Elim admin can correct scores or record a walkover");
    if (!admin && caller !== first && caller !== second)
        return reply(403, "Only a player or an Elim admin can submit the score");
    if (match.is_bye || !first || !second)
        return reply(409, "This match is not ready for a result");
    if (data.first_id !== first || data.second_id !== second)
        return reply(409, "The players changed. Refresh the match and try again");

    const round = Number(match.bracket_round);
    const position = Number(match.bracket_match);
    const next = round < Number(elim.rounds)
        ? await get("match", elimBracketId("match", id, round + 1, Math.ceil(position / 2)))
        : undefined;
    const walkover = action === "walkover";
    const a = data.first_score;
    const b = data.second_score;
    if (walkover ? data.winner_id !== first && data.winner_id !== second
        : typeof a !== "number" || typeof b !== "number" || !Number.isInteger(a)
            || !Number.isInteger(b) || a < 0 || a > 8 || b < 0 || b > 8 || a === b)
        return reply(400, walkover ? "Select the player who advances" : "Enter two different whole-number scores from 0 to 8");
    const winner = walkover ? String(data.winner_id) : Number(a) > Number(b) ? first : second;
    const attributes = {
        winner_id: winner, is_walkover: walkover,
        first_score: walkover ? "" : Number(a), second_score: walkover ? "" : Number(b),
    };
    const same = Object.entries(attributes).every(([key, value]) => match[key] === value);
    if (same) {
        await doGuidsToPublic();
        return reply(200, "Result already recorded", matchId);
    }
    if (action === "correct" && !match.winner_id)
        return reply(409, "Enter the initial score first");
    if (match.winner_id && action !== "correct")
        return reply(409, "This match already has a result");
    if (next?.winner_id)
        return reply(409, "The next match already has a recorded result");

    // Record the match to repair before writing the authoritative result.
    // If the result write never happened, recovery simply clears the pointer.
    await client.updateEntity({
        partitionKey: "elim", rowKey: id, pending_match_id: matchId,
    }, "Merge");
    await client.updateEntity({
        partitionKey: "match", rowKey: matchId, ...attributes,
        result_pending: true, result_exclude_user: admin ? "" : caller,
        result_action: action,
    }, "Merge");
    await repairResult(elim, matchId, context);
    return reply(200, "Result recorded", matchId);
}

async function repairResult(elim: Row, matchId: string, context: InvocationContext) {
    const match = await get("match", matchId);
    if (match?.result_pending === true) {
        await finishResult(elim, match);
        await doGuidsToPublic();
        const notice = match.result_action === "walkover" ? "A walkover was recorded"
            : match.result_action === "correct" ? "The match score was corrected"
            : "Match scores have been submitted";
        await notify(
            context, [String(match.first_id), String(match.second_id)],
            String(match.result_exclude_user ?? "") || undefined,
            String(match.name), notice, `match/${matchId}`, matchId,
        );
        await client.updateEntity({
            partitionKey: "match", rowKey: matchId, result_pending: false,
            result_exclude_user: "", result_action: "",
        }, "Merge");
    }
    await client.updateEntity({
        partitionKey: "elim", rowKey: elim.rowKey, pending_match_id: "",
    }, "Merge");
}

export async function elimAction(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const action = request.params.action;
    if (action === "activate") return groupAction(request, context, action, "elim");
    if (!["join", "accept", "leave", "seed", "unseed", "draw", "score", "correct", "walkover"].includes(action))
        return reply(404, "Unknown Elim action");
    let body;
    try {
        body = (await request.json()) as {
            caller_id?: string; device_id?: string; signature?: string;
            data?: Record<string, unknown>;
        };
    } catch {
        return reply(400, "Invalid JSON payload");
    }
    const { caller_id: caller, device_id, signature, data = {} } = body ?? {};
    if (!data || typeof data !== "object" || Array.isArray(data)
        || typeof caller !== "string" || typeof device_id !== "string" || typeof signature !== "string")
        return reply(400, "A signed request and valid data are required");
    try {
        await doSignatureVerification({ callerId: caller, deviceId: device_id, signature, url: request.url }, context);
    } catch (error) {
        return reply(401, error instanceof Error ? error.message : "Unauthorised");
    }
    const user = caller.startsWith("user_") ? await get("user", caller) : undefined;
    if (!user) return reply(403, "A user account is required");
    const id = request.params.elim_id;
    if (!id?.startsWith("elim_")) return reply(400, "elim_id is required");
    const elim = await get("elim", id);
    if (!elim) return reply(404, "Elim not found");
    if (elim.state === "pending") return reply(409, "The Elim is awaiting club approval");
    const leaseLength = 300_000;
    let guard = Date.now() + leaseLength;
    if (Number(elim.operation_guard ?? 0) > Date.now())
        return reply(409, "Another Elim action is in progress. Try again shortly");
    try {
        await client.updateEntity({
            partitionKey: "elim", rowKey: id, operation_guard: guard,
        }, "Merge", { etag: elim.etag });
    } catch (error) {
        if (hasStatus(error, 412)) return reply(409, "The Elim changed. Please retry");
        throw error;
    }

    async function renewGuard() {
        if (guard - Date.now() > 60_000) return;
        const current = await get("elim", id);
        if (current?.operation_guard !== guard)
            throw new Error("The Elim operation expired. Please retry");
        const renewed = Date.now() + leaseLength;
        await client.updateEntity({
            partitionKey: "elim", rowKey: id, operation_guard: renewed,
        }, "Merge", { etag: current.etag });
        guard = renewed;
    }

    try {
        const members = await users(id);
        const mine = members.find(row => row.rowKey === caller);
        const admin = mine?.is_admin === true;
        const entrants = members.filter(row => row.is_participant === true);
        if (["score", "correct", "walkover"].includes(action)) {
            if (!admin && mine?.is_participant !== true)
                return reply(403, "Only an entrant or an Elim admin can submit scores");
            if (typeof elim.pending_match_id === "string" && elim.pending_match_id)
                await repairResult(elim, elim.pending_match_id, context);
            return await score(elim, String(data.match_id ?? ""), caller, admin, action, data, context);
        }
        if (!["join", "leave"].includes(action) && !admin)
            return reply(403, "Only an Elim admin can do this");
        if (action === "draw") {
            if (elim.state === "active" || elim.state === "complete") {
                await doGuidsToPublic();
                return reply(200, "Draw already started", id);
            }
            if (entrants.length < 2) return reply(400, "At least two accepted entrants are required");
            if (elim.state === "drawing" && elim.draw_version !== 1)
                return reply(409, "This draw version is unavailable");
            await client.updateEntity({
                partitionKey: "elim", rowKey: id, state: "drawing", draw_version: 1,
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
        }
        if (elim.state !== "open") return reply(409, "Entries and seeding are closed");

        const userId = ["join", "leave"].includes(action) ? caller : data.user_id;
        const member = members.find(row => row.rowKey === userId);
        const seeds = entrants.filter(row => Number(row.seed) > 0);
        const attributes = member ? props(member) : {};
        const changed = new Map<string, Record<string, unknown>>();
        let recipients: string[] = [];
        let message: string;
        if (action === "join") {
            if (member?.is_participant === true) return reply(409, "You have already joined");
            changed.set(caller, { ...attributes, state: "pending", is_participant: false });
            recipients = members.filter(row => row.is_admin === true).map(row => row.rowKey);
            message = "Join requested";
        } else if (action === "accept") {
            if (!member || (member.state !== "pending" && member.is_participant !== true))
                return reply(409, "This player has no pending request");
            changed.set(member.rowKey, { ...attributes, state: "accepted", is_participant: true });
            recipients = member.state === "pending" ? [member.rowKey] : [];
            message = "Join request accepted";
        } else {
            if (!member || (action !== "leave" && member.is_participant !== true))
                return reply(409, "This player is not an accepted entrant");
            const rank = Number(member.seed ?? 0);
            if (action === "seed") {
                if (!rank && seeds.length >= 8) return reply(409, "All eight seeds are assigned");
                changed.set(member.rowKey, { ...attributes, seed: rank || seeds.length + 1 });
                message = "Seed assigned";
            } else {
                for (const lower of seeds.filter(row => rank > 0 && Number(row.seed) > rank)) {
                    changed.set(lower.rowKey, { ...props(lower), seed: Number(lower.seed) - 1 });
                }
                changed.set(member.rowKey, {
                    ...attributes, seed: 0,
                    ...(action === "leave" ? { state: "left", is_participant: false } : {}),
                });
                message = action === "leave" ? "Entry withdrawn" : "Seed removed";
            }
        }

        const updates: TransactionAction[] = [...changed].map(([rowKey, values]) =>
            ["upsert", { partitionKey: id, rowKey, ...values }, "Replace"]);
        await client.submitTransaction(updates);
        // Refresh all mirrors so a retry can also repair the lower seeds after
        // an interrupted multi-row update.
        for (const row of await users(id)) await mirrorUser(row);
        await doGuidsToPublic();
        if (recipients.length)
            await notify(context, recipients, caller, String(elim.name),
                action === "join" ? `${user.name ?? "A player"} has requested to join` : message,
                `elim/${id}`, id);
        return reply(200, message, id);
    } finally {
        const current = await get("elim", id);
        if (current?.operation_guard === guard) {
            await client.updateEntity({
                partitionKey: "elim", rowKey: id, operation_guard: 0,
            }, "Merge", { etag: current.etag });
        }
    }
}

app.http("elimCreate", {
    methods: ["POST"], route: "elim/create", authLevel: "anonymous",
    handler: (request, context) => groupAction(request, context, "create", "elim"),
});
app.http("elimAction", {
    methods: ["POST"], route: "elim/{elim_id}/{action}", authLevel: "anonymous",
    handler: elimAction,
});
