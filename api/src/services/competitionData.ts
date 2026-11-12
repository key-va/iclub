import { OfficialRound, TeamMapping } from "./competitionProvider";

// Stored graph contract: ext_* is imported data/source mapping; name, state,
// result, home_away and external_key are the app's normalized interpretation.
const mappingFields = {
    provider: "provider",
    association: "association",
    competition: "competition",
    section: "section",
    external_team: "team",
    season: "season",
};
const teamFields = {
    ...mappingFields,
    name: "name",
    competition_name: "competition_name",
    section_name: "section_name",
    standings: "standings",
    calendar: "calendar",
    rank: "rank",
    wins: "wins",
    points: "points",
    percentage: "percentage",
};
const roundFields = [
    "number",
    "date",
    "opponent",
    "venue",
    "points_for",
    "points_against",
    "sets_for",
    "sets_against",
    "games_for",
    "games_against",
];
function attributes(row: Record<string, any>, legacy: string[]) {
    return Object.fromEntries(
        Object.entries(row).filter(
            ([key]) =>
                ![
                    "partitionKey",
                    "rowKey",
                    "timestamp",
                    "etag",
                    ...legacy,
                ].includes(key),
        ),
    );
}
export function teamMapping(team: Record<string, any>): TeamMapping {
    const values = Object.fromEntries(
        Object.entries(mappingFields).map(([key, external]) => [
            key,
            team[`ext_${external}`] ?? team[key],
        ]),
    );
    if (
        Object.values(values).some(
            (value) => typeof value !== "string" || !value,
        )
    )
        throw Error("Team external mapping is incomplete");
    return values as unknown as TeamMapping;
}
export function teamExternalFields(source: Record<string, any>) {
    return Object.fromEntries(
        Object.entries(teamFields)
            .filter(([key]) => source[key] !== undefined)
            .map(([key, external]) => [`ext_${external}`, source[key]]),
    );
}
export function teamAttributes(row: Record<string, any>) {
    // Preserve app-owned name/state, ownership and operational attributes.
    const next = attributes(
        row,
        Object.keys(teamFields).filter((key) => key !== "name"),
    );
    for (const [key, external] of Object.entries(teamFields)) {
        if (next[`ext_${external}`] === undefined && row[key] !== undefined)
            next[`ext_${external}`] = row[key];
    }
    return next;
}
export function roundCondition(row: Record<string, any>): string {
    if (row.state === undefined) return String(row.status ?? "scheduled"); // legacy dataset
    if (row.result === "bye" || row.result === "washout") return row.result;
    if (row.state === "complete") return "completed";
    return /postpon/i.test(String(row.ext_status ?? ""))
        ? "postponed"
        : "scheduled";
}
export function roundAttributes(
    old: Record<string, any>,
    provider: string,
    externalKey: string,
    teamName: string,
    incoming?: OfficialRound,
) {
    const next = attributes(old, [
        ...roundFields,
        "provider",
        "status",
        "external_match",
        "team_id",
    ]);
    for (const key of roundFields) {
        if (next[`ext_${key}`] === undefined && old[key] !== undefined)
            next[`ext_${key}`] = old[key];
        if (incoming?.[key] !== undefined) next[`ext_${key}`] = incoming[key];
    }
    if (next.ext_match === undefined && old.external_match !== undefined)
        next.ext_match = old.external_match;
    if (incoming?.external_match !== undefined)
        next.ext_match = incoming.external_match;
    const previous = roundCondition(old);
    const preserveResult =
        incoming?.status === "scheduled" &&
        ["completed", "washout", "postponed"].includes(previous);
    const condition = incoming && !preserveResult ? incoming.status : previous;
    // Only literal source labels belong in ext_status; never store synthetic
    // 'scheduled'/'completed' strings there. An empty source label removes it.
    if (incoming?.source_status !== undefined && !preserveResult) {
        if (incoming.source_status) next.ext_status = incoming.source_status;
        else delete next.ext_status;
    }
    next.ext_provider = provider;
    next.external_key = externalKey; // generated stable app key, not a source ID
    next.home_away = incoming?.home_away ?? old.home_away ?? "";
    next.state = ["completed", "bye", "washout"].includes(condition)
        ? "complete"
        : "pending";
    delete next.result;
    if (condition === "bye" || condition === "washout") next.result = condition;
    else if (
        condition === "completed" &&
        typeof next.ext_points_for === "number" &&
        typeof next.ext_points_against === "number"
    ) {
        next.result =
            next.ext_points_for === next.ext_points_against
                ? "draw"
                : next.ext_points_for > next.ext_points_against
                  ? "winner"
                  : "loser";
    }
    next.name = `${next.ext_opponent ?? ""} vs ${teamName}`;
    return next;
}
