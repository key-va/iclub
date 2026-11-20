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

const users = (id: string) => links(id, "user");

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

async function links(id: string, type: string): Promise<Row[]> {
    const rows: Row[] = [];
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${id}` },
    })) {
        if (row.rowKey.startsWith(`${type}_`)) rows.push({ ...row, partitionKey: id, rowKey: row.rowKey });
    }
    return rows;
}

function sameAttributes(row: Row | undefined, attributes: Record<string, unknown>) {
    if (!row) return false;
    const current = props(row);
    return Object.keys(current).length === Object.keys(attributes).length &&
        Object.entries(attributes).every(([name, value]) => current[name] === value);
}

async function writeIfChanged(pk: string, rk: string, attributes: Record<string, unknown>) {
    if (!sameAttributes(await get(pk, rk), attributes))
        await doUpsertEntity(pk, rk, attributes);
}

type Competitor = { id: string; slot: number; result?: string; score?: number };

function competitors(rows: Row[]): Competitor[] {
    return rows.filter(row => row.slot === 1 || row.slot === 2).map(row => ({
        id: row.rowKey,
        slot: Number(row.slot),
        ...(typeof row.result === "string" ? { result: row.result } : {}),
        ...(typeof row.score === "number" ? { score: row.score } : {}),
    }));
}

function assignedPlayers(first: string, second: string): Competitor[] {
    return [first, second].flatMap((id, i) => id ? [{ id, slot: i + 1 }] : []);
}

async function writeCompetitors(matchId: string, players: Competitor[]) {
    const previous = await users(matchId);
    for (const row of previous) {
        if (players.some(player => player.id === row.rowKey)) continue;
        // Remove the reverse first so an interrupted removal can still be retried.
        await remove(row.rowKey, matchId);
        await remove(matchId, row.rowKey);
    }
    const records = players.map(({ id, ...attributes }) => ({
        partitionKey: matchId, rowKey: id, role: "competitor", ...attributes,
    }));
    const updates: TransactionAction[] = records
        .filter(row => !sameAttributes(previous.find(old => old.rowKey === row.rowKey), props(row)))
        .map(row => ["upsert", row, "Replace"]);
    if (updates.length) await client.submitTransaction(updates);
    for (const row of records)
        await writeIfChanged(row.rowKey, matchId, props(row));
}

function winnerOf(players: Competitor[]) {
    return players.find(player => player.result === "winner" || player.result === "bye")?.id ?? "";
}

async function projectMatch(matchId: string, label: string, players: Competitor[]) {
    const bye = players.some(player => player.result === "bye");
    let name = `${label} Pending`;
    if (players.length === 2 || bye) {
        const firstNames = await Promise.all(players.map(async player => {
            const user = await get("user", player.id);
            return String(user?.name ?? "").trim().split(/\s+/)[0] || "Player";
        }));
        name = bye ? `${firstNames[0]} (bye)` : firstNames.join(" vs ");
    }
    await writeCompetitors(matchId, players);
    await writeIfChanged("match", matchId, {
        name, state: bye ? "bye" : winnerOf(players) ? "complete" : players.length === 2 ? "active" : "waiting",
    });
}

async function startDraw(elim: Row, entrants: Row[], renewGuard: () => Promise<void>) {
    const id = elim.rowKey;
    const { rounds, slots } = elimDraw(id, entrants.map(row => ({
        id: row.rowKey, seed: Number(row.seed ?? 0),
    })));
    const winners = new Map<string, string>();
    for (let round = 1; round <= rounds; round++) {
        const roundId = elimBracketId("round", id, round);
        const label = elimRoundName(round, rounds);
        await writeIfChanged("round", roundId, { name: `${elim.name} ${label}` });
        await doUpsertRelation(id, roundId, { bracket_round: round });
        for (let position = 1; position <= 2 ** (rounds - round); position++) {
            await renewGuard();
            const matchId = elimBracketId("match", id, round, position);
            const [first, second] = round === 1
                ? [slots[2 * position - 2], slots[2 * position - 1]]
                : [2 * position - 1, 2 * position].map(feeder =>
                    winners.get(elimBracketId("match", id, round - 1, feeder)) ?? "");
            const players = assignedPlayers(first, second);
            if (round === 1 && players.length === 1) {
                players[0].result = "bye";
                winners.set(matchId, players[0].id);
            }
            // The clean match row is committed last. Its presence means the
            // deterministic slots and mirrored links were fully written.
            const existing = await get("match", matchId);
            if (existing && sameAttributes(existing, { name: existing.name, state: existing.state }))
                continue;
            await doUpsertRelation(id, matchId);
            await doUpsertRelation(roundId, matchId, { bracket_match: position });
            await projectMatch(matchId, label, players);
        }
    }
    await updateCompetition(id, { state: "active" }, ["draw_version"]);
}

async function updateCompetition(id: string, changes: Record<string, unknown>, removeFields: string[]) {
    const current = await get("comp", id);
    if (!current) throw new Error("Competition is missing");
    const attributes = props(current);
    for (const name of removeFields) delete attributes[name];
    await client.updateEntity({
        partitionKey: "comp", rowKey: id, ...attributes, ...changes,
    }, "Replace", { etag: current.etag });
}

async function matchPlacement(compId: string, matchId: string) {
    const roundLinks = await links(compId, "round");
    const [matchRound] = await links(matchId, "round");
    const round = roundLinks.find(link => link.rowKey === matchRound?.rowKey);
    if (!round || !matchRound) throw new Error("Competition match is missing its round");
    return {
        round: Number(round.bracket_round),
        position: Number(matchRound.bracket_match),
        rounds: roundLinks.length,
    };
}

type PendingResult = {
    matchId: string;
    players: Competitor[];
    action: string;
    excludeUser?: string;
};

function legacyPlayers(match: Row): Competitor[] {
    return assignedPlayers(String(match.first_id ?? ""), String(match.second_id ?? "")).map(player => {
        const score = player.slot === 1 ? match.first_score : match.second_score;
        const result = match.is_bye || match.state === "bye" ? "bye"
            : match.winner_id === player.id ? "winner"
            : match.winner_id ? (match.is_walkover ? "walkover" : match.is_forfeit ? "forfeiter" : "loser")
            : undefined;
        return {
            ...player, ...(result ? { result } : {}),
            ...(typeof score === "number" ? { score } : {}),
        };
    });
}

// The legacy marker is removed last so a partial conversion can resume under the same guard.
async function migrateCompetition(elim: Row, renewGuard: () => Promise<void>) {
    if (elim.competition_type === undefined) return;
    const id = elim.rowKey;
    if (elim.state !== "drawing") {
        for (const roundLink of await links(id, "round")) {
            await renewGuard();
            const round = await get("round", roundLink.rowKey);
            if (!round) throw new Error("Competition round is missing");
            if (round.bracket_round !== undefined) {
                await doUpsertRelation(id, round.rowKey, { bracket_round: round.bracket_round });
                await doUpsertEntity("round", round.rowKey, { name: round.name });
            }
            for (const matchLink of await links(round.rowKey, "match")) {
                await renewGuard();
                const match = await get("match", matchLink.rowKey);
                if (!match) throw new Error("Competition match is missing");
                if (match.bracket_match === undefined) continue;
                const players = legacyPlayers(match);
                if (match.result_pending === true) {
                    const pending: PendingResult = {
                        matchId: match.rowKey, players, action: String(match.result_action),
                        excludeUser: String(match.result_exclude_user ?? "") || undefined,
                    };
                    await updateCompetition(id, { pending_result: JSON.stringify(pending) }, []);
                }
                await doUpsertRelation(round.rowKey, match.rowKey, { bracket_match: match.bracket_match });
                await writeCompetitors(match.rowKey, players);
                await doUpsertEntity("match", match.rowKey, { name: match.name, state: match.state });
            }
        }
    }
    await updateCompetition(id, {
        comp_system: elim.comp_system ?? elim.competition_type,
        format: elim.format ?? "singles",
        match_format: elim.match_format ?? "super_set",
    }, ["competition_type", "rounds", "champion_id", "pending_match_id",
        ...(elim.state === "drawing" ? [] : ["draw_version"])]);
}

async function repairResult(id: string, pending: PendingResult, context: InvocationContext) {
    const { matchId, players } = pending;
    const { round, position, rounds } = await matchPlacement(id, matchId);
    await projectMatch(matchId, elimRoundName(round, rounds), players);
    if (round === rounds) {
        await updateCompetition(id, { state: "complete" }, []);
    } else {
        const nextPosition = Math.ceil(position / 2);
        const nextId = elimBracketId("match", id, round + 1, nextPosition);
        const feeders = await Promise.all([2 * nextPosition - 1, 2 * nextPosition].map(async feeder =>
            winnerOf(competitors(await users(elimBracketId("match", id, round, feeder))))
        ));
        await projectMatch(nextId, elimRoundName(round + 1, rounds), assignedPlayers(feeders[0], feeders[1]));
    }
    await doGuidsToPublic();
    const match = await get("match", matchId);
    const notice = pending.action === "forfeit" ? "The match was forfeited"
        : pending.action === "walkover" ? "A walkover was recorded"
        : pending.action === "correct" ? "The match score was corrected"
        : "Match scores have been submitted";
    await notify(context, players.map(player => player.id), pending.excludeUser,
        String(match?.name), notice, `match/${matchId}`, matchId);
    await updateCompetition(id, {}, ["pending_result"]);
}

async function score(
    elim: Row, matchId: string, caller: string, admin: boolean,
    action: string, data: Record<string, unknown>, context: InvocationContext,
) {
    const id = elim.rowKey;
    if (!["active", "complete"].includes(String(elim.state)))
        return reply(409, "The draw has to be ready before scoring");
    if (!matchId.startsWith("match_") || !(await get(id, matchId)))
        return reply(404, "Competition match not found");
    const match = await get("match", matchId);
    if (!match) return reply(404, "Competition match not found");
    const players = competitors(await users(matchId)).sort((a, b) => a.slot - b.slot);
    const [first, second] = players;
    const playing = players.some(player => player.id === caller);
    const forfeit = action === "forfeit";
    if (action === "correct" && !admin)
        return reply(403, "Only a competition admin can correct scores");
    if (forfeit && !playing)
        return reply(403, "Only a player in this match can forfeit");
    if (!admin && !playing)
        return reply(403, "Only a player or a competition admin can submit the score");
    if (match.state === "bye" || !first || !second)
        return reply(409, "This match is not ready for a result");
    if (data.first_id !== first.id || data.second_id !== second.id)
        return reply(409, "The players changed. Refresh the match and try again");

    const a = data.first_score;
    const b = data.second_score;
    if (!forfeit && (typeof a !== "number" || typeof b !== "number" || !Number.isInteger(a)
        || !Number.isInteger(b) || a < 0 || a > 8 || b < 0 || b > 8 || a === b))
        return reply(400, "Enter two different whole-number scores from 0 to 8");
    const winner = forfeit ? (caller === first.id ? second.id : first.id)
        : Number(a) > Number(b) ? first.id : second.id;
    const updated = players.map(player => ({
        id: player.id, slot: player.slot,
        result: player.id === winner ? "winner" : forfeit ? "forfeiter" : "loser",
        ...(forfeit ? {} : { score: Number(player.slot === 1 ? a : b) }),
    }));
    if (updated.every((player, index) =>
        player.result === players[index].result && player.score === players[index].score
    )) {
        await doGuidsToPublic();
        return reply(200, "Result already recorded", matchId);
    }
    if (action === "correct" && match.state !== "complete")
        return reply(409, "Enter the initial score first");
    if (match.state === "complete" && action !== "correct")
        return reply(409, "This match already has a result");
    const { round, position, rounds } = await matchPlacement(id, matchId);
    if (round < rounds) {
        const next = await get("match", elimBracketId("match", id, round + 1, Math.ceil(position / 2)));
        if (next?.state === "complete")
            return reply(409, "The next match already has a recorded result");
    }

    // Persist the intended result before changing any relations. A retry can
    // replay the projection, including the inverse links and the next match.
    const pending: PendingResult = {
        matchId, players: updated, action, excludeUser: admin && !forfeit ? undefined : caller,
    };
    await updateCompetition(id, { pending_result: JSON.stringify(pending) }, []);
    await repairResult(id, pending, context);
    return reply(200, "Result recorded", matchId);
}

export async function compAction(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const action = request.params.action;
    if (action === "activate") return groupAction(request, context, action, "comp");
    if (!["join", "accept", "leave", "seed", "unseed", "draw", "score", "correct", "forfeit"].includes(action))
        return reply(404, "Unknown competition action");
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
    const id = request.params.comp_id;
    if (!id?.startsWith("comp_")) return reply(400, "comp_id is required");
    const elim = await get("comp", id);
    if (!elim) return reply(404, "Competition not found");
    if ((elim.comp_system ?? elim.competition_type) !== "elimination")
        return reply(409, "This action requires an elimination competition");
    if (elim.state === "pending") return reply(409, "The competition is awaiting club approval");
    const leaseLength = 300_000;
    let guard = Date.now() + leaseLength;
    if (Number(elim.operation_guard ?? 0) > Date.now())
        return reply(409, "Another competition action is in progress. Try again shortly");
    try {
        await client.updateEntity({
            partitionKey: "comp", rowKey: id, operation_guard: guard,
        }, "Merge", { etag: elim.etag });
    } catch (error) {
        if (hasStatus(error, 412)) return reply(409, "The competition changed. Please retry");
        throw error;
    }

    async function renewGuard() {
        if (guard - Date.now() > 60_000) return;
        const current = await get("comp", id);
        if (current?.operation_guard !== guard)
            throw new Error("The competition operation expired. Please retry");
        const renewed = Date.now() + leaseLength;
        await client.updateEntity({
            partitionKey: "comp", rowKey: id, operation_guard: renewed,
        }, "Merge", { etag: current.etag });
        guard = renewed;
    }

    try {
        const members = await users(id);
        const mine = members.find(row => row.rowKey === caller);
        const admin = mine?.is_admin === true;
        const entrants = members.filter(row => row.is_participant === true);
        if (["score", "correct", "forfeit"].includes(action)) {
            if (!admin && mine?.is_participant !== true)
                return reply(403, "Only an entrant or a competition admin can submit scores");
            await migrateCompetition(elim, renewGuard);
            const current = (await get("comp", id))!;
            if (typeof current.pending_result === "string")
                await repairResult(id, JSON.parse(current.pending_result), context);
            return await score((await get("comp", id))!, String(data.match_id ?? ""), caller, admin, action, data, context);
        }
        if (!["join", "leave"].includes(action) && !admin)
            return reply(403, "Only a competition admin can do this");
        await migrateCompetition(elim, renewGuard);
        if (action === "draw") {
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
                `comp/${id}`, id);
        return reply(200, message, id);
    } finally {
        const current = await get("comp", id);
        if (current?.operation_guard === guard) {
            const { operation_guard, ...attributes } = props(current);
            await client.updateEntity({
                partitionKey: "comp", rowKey: id, ...attributes,
            }, "Replace", { etag: current.etag });
        }
    }
}

app.http("compCreate", {
    methods: ["POST"], route: "comp/create", authLevel: "anonymous",
    handler: (request, context) => groupAction(request, context, "create", "comp"),
});
app.http("compAction", {
    methods: ["POST"], route: "comp/{comp_id}/{action}", authLevel: "anonymous",
    handler: compAction,
});
