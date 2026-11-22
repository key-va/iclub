export function roundRobinDraw(entrants: string[]) {
    const rotation = [...entrants].sort();
    if (rotation.length % 2) rotation.push("");
    const rounds: { matches: [string, string][]; bye?: string }[] = [];
    for (let index = 0; index < rotation.length - 1; index++) {
        const round: (typeof rounds)[number] = { matches: [] };
        for (let slot = 0; slot < rotation.length / 2; slot++) {
            const first = rotation[slot];
            const second = rotation[rotation.length - 1 - slot];
            if (!first || !second) round.bye = first || second;
            else round.matches.push([first, second]);
        }
        rounds.push(round);
        rotation.splice(1, 0, rotation.pop()!);
    }
    return rounds;
}
