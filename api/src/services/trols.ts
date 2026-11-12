import {
    CompetitionOption,
    CompetitionProvider,
    OfficialRound,
    Standing,
    TeamMapping,
} from "./competitionProvider";

// These pages are small, server-rendered forms/tables. Parse only the known select/row structures;
// never evaluate scripts or follow URLs supplied by callers or HTML.
export function text(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(
            /&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:x[\da-f]+|\d+);/gi,
            (value) => {
                const named = {
                    "&nbsp;": " ",
                    "&amp;": "&",
                    "&quot;": '"',
                    "&apos;": "'",
                    "&lt;": "<",
                    "&gt;": ">",
                };
                if (named[value.toLowerCase()] !== undefined)
                    return named[value.toLowerCase()];
                const code = value.slice(2, -1);
                const point =
                    code[0].toLowerCase() === "x"
                        ? parseInt(code.slice(1), 16)
                        : Number(code);
                return point > 0 && point <= 0x10ffff
                    ? String.fromCodePoint(point)
                    : "";
            },
        )
        .replace(/\s+/g, " ")
        .trim();
}
const attr = (html: string, name: string) =>
    html
        .match(
            new RegExp(
                `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
                "i",
            ),
        )
        ?.slice(1)
        .find((v) => v !== undefined) ?? "";
export function options(html: string, name: string): CompetitionOption[] {
    const select = [
        ...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi),
    ].find((m) => attr(m[1], "name") === name);
    if (!select) throw Error(`TROLS ${name} selection is missing`);
    const result = [
        ...select[2].matchAll(
            /<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/option>|$)/gi,
        ),
    ]
        .map((m) => ({ id: attr(m[1], "value"), name: text(m[2]) }))
        .filter((v) => v.id && v.name);
    if (
        !result.length ||
        new Set(result.map((v) => v.id)).size !== result.length
    )
        throw Error(`Invalid TROLS ${name} options`);
    return result;
}
function rows(html: string) {
    return [...html.matchAll(/<tr\b[^>]*>((?:(?!<tr\b)[\s\S])*?)<\/tr>/gi)].map(
        (m) => ({
            html: m[1],
            cells: [
                ...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi),
            ].map((c) => text(c[1])),
        }),
    );
}
const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
export function dateOf(value: string): string {
    const m = value.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{2}|\d{4})$/);
    if (!m) throw Error(`Invalid TROLS date: ${value}`);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const month = months.indexOf(m[2]);
    const date = new Date(Date.UTC(year, month, Number(m[1])));
    if (
        month < 0 ||
        date.getUTCMonth() !== month ||
        date.getUTCDate() !== Number(m[1])
    )
        throw Error("Invalid TROLS date");
    return date.toISOString().slice(0, 10);
}
function seasonOf(name: string) {
    const season = name.match(
        /-\s*((?:Spring|Summer|Autumn|Winter)\s+\d{4}(?:\/\d{2,4})?)\s*$/i,
    )?.[1];
    if (!season) throw Error("TROLS competition season is missing");
    return season;
}
function chosen(html: string, name: string, id: string) {
    const option = options(html, name).find((o) => o.id === id);
    if (!option) throw Error(`Unknown TROLS ${name}`);
    return option;
}
function selected(html: string, name: string, id: string) {
    const select = [
        ...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi),
    ].find((m) => attr(m[1], "name") === name);
    const option =
        select &&
        [...select[2].matchAll(/<option\b([^>]*)>/gi)].find((m) =>
            /\bselected\b/i.test(m[1]),
        );
    if (!option || attr(option[1], "value") !== id)
        throw Error(`TROLS did not return the requested ${name}`);
}
const cache = new Map<string, { expires: number; value: Promise<string> }>();
async function page(
    kind: string,
    competition = "",
    section = "",
    team = "",
    cached = false,
): Promise<string> {
    const params = new URLSearchParams({
        which: team ? "2" : section ? "1" : "0",
        style: "",
        daytime: competition,
        section,
        team,
    });
    const key = kind + params.toString();
    if (cached && cache.get(key)?.expires > Date.now())
        return cache.get(key)!.value;
    const value = (async () => {
        const response = await fetch(`https://trols.org.au/brta/${kind}.php`, {
            method: "POST",
            body: params,
            signal: AbortSignal.timeout(20000),
            redirect: "error",
        });
        if (!response.ok)
            throw Error(`TROLS request failed (${response.status})`);
        const html = await response.text();
        if (html.length > 2_000_000 || !/<\/html>/i.test(html))
            throw Error("Incomplete TROLS response");
        options(html, "daytime");
        return html;
    })();
    if (cached) {
        if (cache.size > 100) cache.clear();
        cache.set(key, { expires: Date.now() + 60000, value });
        value.catch(() => {
            if (cache.get(key)?.value === value) cache.delete(key);
        });
    }
    return value;
}
function association(value: string) {
    if (value !== "brta") throw Error("Unsupported association");
}
export function parseFixture(html: string, teamName: string) {
    const start = html.indexOf("Fixture for ");
    if (
        start < 0 ||
        !text(html.slice(start, html.indexOf("</tr>", start))).includes(
            teamName,
        )
    )
        throw Error("TROLS team fixture is missing");
    const venues = new Map<string, string>();
    for (const row of rows(html.slice(0, start))) {
        const venue = row.html.match(/pop_map\('([^']+)'/)?.[1];
        if (venue && row.cells.length >= 3)
            venues.set(row.cells[1], text(venue));
    }
    const rounds: OfficialRound[] = [];
    const calendar: { date: string; name: string }[] = [];
    for (const { cells: c } of rows(html.slice(start))) {
        if (/^\d+$/.test(c[0] ?? "")) {
            if (c.length < 4) throw Error("Invalid TROLS fixture row");
            const home = c[2] === teamName;
            const away = c[3] === teamName;
            if (home === away)
                throw Error("TROLS fixture has an unexpected team");
            const opponent = home ? c[3] : c[2];
            if (!opponent) throw Error("TROLS opponent is missing");
            const bye = /^bye$/i.test(opponent);
            const venue = bye ? "" : venues.get(c[2]);
            if (!bye && !venue) throw Error("TROLS venue directory is missing");
            rounds.push({
                number: Number(c[0]),
                date: dateOf(c[1]),
                opponent,
                home_away: bye ? "" : home ? "home" : "away",
                venue: venue ?? "",
                status: bye ? "bye" : "scheduled",
            });
        } else if (c[1] && /No Play/i.test(c[2] ?? ""))
            calendar.push({ date: dateOf(c[1]), name: "No Play" });
        for (const cell of c) {
            const final = cell.match(
                /^(Semi Final|Grand Final|Spare \(if required\)) - (\d{1,2} \w{3} \d{2,4})$/,
            );
            if (final)
                calendar.push({ name: final[1], date: dateOf(final[2]) });
        }
    }
    if (
        !rounds.length ||
        new Set(rounds.map((r) => r.number)).size !== rounds.length
    )
        throw Error("Invalid TROLS rounds");
    return { rounds, calendar };
}
export function parseResults(
    html: string,
    teamName: string,
    rounds: OfficialRound[],
) {
    if (!/Home Team/.test(html) || !/Away Team/.test(html))
        throw Error("TROLS results table is missing");
    let number: number | undefined;
    const seen = new Set<number>();
    for (const row of rows(html)) {
        const heading = text(row.html).match(/Rd\.\s*(\d+)/);
        if (heading) {
            number = Number(heading[1]);
            continue;
        }
        const c = row.cells;
        if (
            !number ||
            c.length < 3 ||
            (c[0] !== teamName && c[c.length - 1] !== teamName)
        )
            continue;
        const round = rounds.find((r) => r.number === number);
        if (!round || seen.has(number))
            throw Error("Unexpected TROLS result round");
        seen.add(number);
        const home = c[0] === teamName;
        const opponent = home ? c[c.length - 1] : c[0];
        if (
            round.opponent !== opponent ||
            (round.status !== "bye" &&
                round.home_away !== (home ? "home" : "away"))
        )
            throw Error("TROLS fixture/results disagree");
        if (/^bye$/i.test(opponent)) {
            round.status = "bye";
            continue;
        }
        if (c.length === 3) {
            if (/wash\s*out/i.test(c[1])) round.status = "washout";
            else if (/postpon/i.test(c[1])) round.status = "postponed";
            else if (c[1]) throw Error("Unknown TROLS result status");
            continue;
        }
        if (c.length !== 9) throw Error("Invalid TROLS score row");
        const values = [1, 2, 3, 5, 6, 7].map((i) => c[i]);
        if (values.every((v) => v === "")) continue;
        if (!values.every((v) => /^\d+(?:\.\d+)?$/.test(v)))
            throw Error("Invalid TROLS scores");
        const mine = home ? [1, 2, 3] : [5, 6, 7];
        const theirs = home ? [5, 6, 7] : [1, 2, 3];
        round.status = "completed";
        ["points", "sets", "games"].forEach((key, i) => {
            round[`${key}_for`] = Number(c[mine[i]]);
            round[`${key}_against`] = Number(c[theirs[i]]);
        });
        const match = row.html.match(
            /open_match\([^)]*'([A-Za-z0-9]+)'\s*\)/,
        )?.[1];
        if (match) round.external_match = match;
    }
}
export function parseStandings(html: string): Standing[] {
    if (!/>Won</i.test(html) || !/>Pts</i.test(html))
        throw Error("TROLS standings table is missing");
    const standings: Standing[] = [];
    for (const { cells: c } of rows(html)) {
        if (
            c.length !== 5 ||
            !c[0] ||
            !c.slice(1, 4).every((v) => /^\d+(?:\.\d+)?$/.test(v))
        )
            continue;
        standings.push({
            name: c[0],
            rank: standings.length + 1,
            wins: Number(c[1]),
            points: Number(c[2]),
            percentage: Number(c[3]),
        });
    }
    if (
        !standings.length ||
        new Set(standings.map((s) => s.name)).size !== standings.length
    )
        throw Error("Invalid TROLS standings");
    return standings;
}
export const trols: CompetitionProvider = {
    async options(input) {
        association(input.association);
        if (input.section && !input.competition)
            throw Error("Competition is required");
        if (!input.competition)
            return {
                kind: "competitions",
                options: options(
                    await page("fixture", "", "", "", true),
                    "daytime",
                ),
            };
        chosen(
            await page("fixture", "", "", "", true),
            "daytime",
            input.competition,
        );
        if (!input.section)
            return {
                kind: "sections",
                options: options(
                    await page("fixture", input.competition, "", "", true),
                    "section",
                ),
            };
        chosen(
            await page("fixture", input.competition, "", "", true),
            "section",
            input.section,
        );
        return {
            kind: "teams",
            options: options(
                await page(
                    "fixture",
                    input.competition,
                    input.section,
                    "",
                    true,
                ),
                "team",
            ),
        };
    },
    async resolve(input) {
        association(input.association);
        const competition = chosen(
            await page("fixture", "", "", "", true),
            "daytime",
            input.competition,
        );
        const section = chosen(
            await page("fixture", input.competition, "", "", true),
            "section",
            input.section,
        );
        const team = chosen(
            await page("fixture", input.competition, input.section, "", true),
            "team",
            input.team,
        );
        return {
            provider: "trols",
            association: "brta",
            competition: competition.id,
            competition_name: competition.name,
            season: seasonOf(competition.name),
            section: section.id,
            section_name: section.name,
            external_team: team.id,
            name: team.name,
        };
    },
    async snapshot(mapping: TeamMapping) {
        association(mapping.association);
        const [fixture, results, ladder] = await Promise.all(
            ["fixture", "results", "ladders"].map((kind) =>
                page(
                    kind,
                    mapping.competition,
                    mapping.section,
                    kind === "fixture" ? mapping.external_team : "",
                ),
            ),
        );
        for (const html of [fixture, results, ladder]) {
            selected(html, "daytime", mapping.competition);
            selected(html, "section", mapping.section);
            if (
                seasonOf(chosen(html, "daytime", mapping.competition).name) !==
                mapping.season
            )
                throw Error(
                    "TROLS season has changed; the saved team was not updated",
                );
        }
        selected(fixture, "team", mapping.external_team);
        const team = chosen(fixture, "team", mapping.external_team);
        const parsed = parseFixture(fixture, team.name);
        parseResults(results, team.name, parsed.rounds);
        const standings = parseStandings(ladder);
        if (!standings.some((s) => s.name === team.name))
            throw Error("Team is missing from TROLS standings");
        return { ...parsed, standings };
    },
};
export function providerFor(provider: string): CompetitionProvider {
    if (provider !== "trols") throw Error("Unsupported competition provider");
    return trols;
}
