import { createHash } from "node:crypto";

export interface Entrant {
    id: string;
    seed: number;
}

const hash = (...parts: string[]) =>
    createHash("sha256").update(parts.join(":")).digest("hex");

export function elimDraw(id: string, entrants: Entrant[]) {
    if (entrants.length < 2) throw new Error("At least two entrants are required");
    const rounds = Math.ceil(Math.log2(entrants.length));
    const size = 2 ** rounds;
    let positions = [1, 2];
    for (let length = 4; length <= size; length *= 2) {
        positions = positions.flatMap(rank => [rank, length + 1 - rank]);
    }

    const ranked = entrants.filter(player => player.seed > 0)
        .sort((a, b) => a.seed - b.seed);
    const shuffled = entrants.filter(player => player.seed === 0)
        .map(player => ({ ...player, key: hash(id, player.id) }))
        .sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const byPriority = [...ranked, ...shuffled];
    return { rounds, slots: positions.map(rank => byPriority[rank - 1]?.id ?? "") };
}

export function elimBracketId(
    type: "round" | "match", compId: string, round: number, position = 0,
) {
    const timestamp = compId.slice("comp_".length, "comp_".length + 19);
    return `${type}_${timestamp}_${hash(compId, type, String(round), String(position)).slice(0, 12)}`;
}

export function elimRoundName(remaining: number, round: number) {
    return ({ 1: "Final", 2: "Semifinal", 3: "Quarterfinal" } as Record<number, string>)[remaining]
        ?? `Round ${round}`;
}
