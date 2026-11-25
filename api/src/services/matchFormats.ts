export const defaultMatchFormat = "super_set";
export const matchFormats = {
    super_set: { maxGames: 8, maxSets: 1 },
    best_of_three: { maxGames: 7, maxSets: 3 },
    fast_four: { maxGames: 4, maxSets: 3 },
};

export function isMatchFormat(format: unknown): format is keyof typeof matchFormats {
    return typeof format === "string" && Object.prototype.hasOwnProperty.call(matchFormats, format);
}

export function matchFormatRules(format: unknown) {
    return matchFormats[isMatchFormat(format) ? format : defaultMatchFormat];
}

export const setsWon = (a: number[], b: number[]) =>
    a.filter((games, i) => games > (b[i] ?? 0)).length;
