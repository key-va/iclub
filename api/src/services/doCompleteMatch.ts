import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { InvocationContext } from "@azure/functions";
import { doUpsertEntity } from "./doUpsertEntity";
import { doUpsertRelation } from "./doUpsertRelation";
import { doGuidsToPublic } from "./doGuidsToPublic";
import { doSendPush } from "./doSendPush";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

type Row = Record<string, unknown>;

export interface CompleteMatchInput {
    matchId: string;
    // the player who withdrew; the opponent is the winner. Omit when the match was played out.
    forfeiterId?: string;
    // games won in each set (one entry for a single-set match); may be partial or empty on a forfeit
    challengerScore?: number[];
    defenderScore?: number[];
}

export interface CompleteMatchResult {
    ok: boolean;
    status: number;
    message: string;
}

async function getRow(pk: string, rk: string): Promise<Row | undefined> {
    try {
        return await guidsClient.getEntity(pk, rk);
    } catch (err: any) {
        if (err?.statusCode === 404) return undefined;
        throw err;
    }
}

function attributesOf(row: Row): Row {
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = row;
    return attributes;
}

const sum = (games: number[]) => games.reduce((total, g) => total + g, 0);

// Sets won by the first side over the second, compared set by set
const setsWon = (a: number[], b: number[]) => a.filter((games, i) => games > (b[i] ?? 0)).length;

// A played-out win in straight sets earns the total game difference; any other win earns a single point
function pointsAwarded(winner: number[], loser: number[]): number {
    const straight = winner.length > 0 && setsWon(winner, loser) === winner.length;
    return straight ? Math.max(1, sum(winner) - sum(loser)) : 1;
}

// Applies the result of a match: relation rows, match state, ladder ranks, points and cooling.
// The caller is responsible for authenticating the request and validating the scores.
export async function doCompleteMatch(input: CompleteMatchInput, context: InvocationContext): Promise<CompleteMatchResult> {

    const { matchId, forfeiterId, challengerScore, defenderScore } = input;

    const match = await getRow("match", matchId);

    if (!match) return { ok: false, status: 404, message: "Match not found" };

    if (match.state !== "pending" && match.state !== "active") {
        return { ok: false, status: 409, message: "This match is already finished" };
    }

    let ladderId = "";
    let challengerId = "";
    let defenderId = "";

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${matchId}` }
    })) {
        const rk = relation.rowKey as string;
        if (rk.startsWith("ladder_")) ladderId = rk;
        else if (relation.role === "challenger") challengerId = rk;
        else if (relation.role === "defender") defenderId = rk;
    }

    if (!ladderId || !challengerId || !defenderId) {
        return { ok: false, status: 409, message: "This match is missing its ladder or players" };
    }

    const ladder = await getRow("ladder", ladderId);

    if (!ladder) return { ok: false, status: 404, message: "Ladder not found" };

    const challengerGames = challengerScore ?? [];
    const defenderGames = defenderScore ?? [];

    const challengerWon = setsWon(challengerGames, defenderGames) > setsWon(defenderGames, challengerGames);
    const winnerId = forfeiterId
        ? (forfeiterId === challengerId ? defenderId : challengerId)
        : (challengerWon ? challengerId : defenderId);
    const loserId = winnerId === challengerId ? defenderId : challengerId;

    const scoresOf = (userId: string) => userId === challengerId ? challengerGames : defenderGames;

    // Ladder participants keyed by user, with their current attributes
    const participants = new Map<string, Row>();

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
    })) {
        if (relation.is_participant === true && typeof relation.rank === "number") {
            participants.set(relation.rowKey as string, attributesOf(relation));
        }
    }

    const challenger = participants.get(challengerId);
    const defender = participants.get(defenderId);
    const winner = participants.get(winnerId);
    const loser = participants.get(loserId);

    if (!challenger || !defender || !winner || !loser) {
        return { ok: false, status: 409, message: "Both players must be on the ladder" };
    }

    const changed = new Set<string>([winnerId, loserId]);
    const isWinPoints = ladder.ladder_system === "win_points";
    const challengeCost = Math.max(0, Number(challenger.rank) - Number(defender.rank));

    // The winner takes the loser's rank when below them, pushing everyone in between down one
    const winnerRank = Number(winner.rank);
    const loserRank = Number(loser.rank);

    if (winnerRank > loserRank) {
        for (const [userId, attributes] of participants) {
            const rank = Number(attributes.rank);
            if (rank >= loserRank && rank < winnerRank) {
                attributes.rank = rank + 1;
                changed.add(userId);
            }
        }
        winner.rank = loserRank;
    }

    if (isWinPoints) {
        winner.points = Number(winner.points ?? 0) + (forfeiterId ? 1 : pointsAwarded(scoresOf(winnerId), scoresOf(loserId)));

        // The challenge is paid for once played; a challenger who withdraws keeps their points
        if (forfeiterId !== challengerId) {
            challenger.points = Math.max(0, Number(challenger.points ?? 0) - challengeCost);
        }
    }

    // The loser cools off until the nightly job (functions/batchAm.ts) frees them; the winner is free to play
    winner.state = "active";
    loser.state = Number(ladder.cool_period ?? 0) > 0 ? "cooling" : "active";

    for (const userId of changed) {
        await doUpsertRelation(ladderId, userId, participants.get(userId));
    }

    // Record the outcome on the match relations, keeping the challenger/defender role
    for (const userId of [challengerId, defenderId]) {
        const games = scoresOf(userId);
        const result = userId === winnerId ? "winner" : (forfeiterId ? "forfeiter" : "loser");

        await doUpsertRelation(matchId, userId, {
            role: userId === challengerId ? "challenger" : "defender",
            result,
            // a single number for a one-set match, otherwise the games in each set e.g. "6,4"
            ...(games.length === 1 ? { score: games[0] } : games.length > 1 ? { score: games.join(",") } : {})
        });
    }

    await doUpsertEntity("match", matchId, { ...attributesOf(match), state: "complete" });

    await doGuidsToPublic();

    const winnerUser = await getRow("user", winnerId);
    const opponentId = forfeiterId ? winnerId : loserId;

    await doSendPush({
        userIds: [opponentId],
        heading: `${match.name}`,
        content: forfeiterId
            ? "Your opponent has forfeited the match. You win"
            : `${winnerUser?.name ?? "Your opponent"} has won the match`,
        path: `match/${matchId}`,
        collapseId: matchId
    }, context);

    context.log(`Match ${matchId} complete, winner ${winnerId}`);

    return { ok: true, status: 200, message: forfeiterId ? "Okay, match forfeited" : "Okay, score submitted" };
}
