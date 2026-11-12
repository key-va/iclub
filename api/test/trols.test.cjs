const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
    trols,
    options,
    parseFixture,
    parseResults,
    parseStandings,
    dateOf,
} = require("../dist/src/services/trols");
const html = (name) =>
    fs.readFileSync(`${__dirname}/fixtures/trols/${name}.html`, "utf8");
const name = "Hurlingham Park Lobs";
const originalFetch = global.fetch;
after(() => (global.fetch = originalFetch));
test("live-captured TROLS tables yield independent numbered fixtures, venues, byes, calendar, results and standings", () => {
    const parsed = parseFixture(html("fixture"), name);
    assert.equal(parsed.rounds.length, 14);
    assert.equal(parsed.rounds[2].status, "bye");
    assert.equal(parsed.rounds[12].status, "scheduled");
    assert.equal(parsed.rounds[12].date, "2026-11-10");
    assert.equal(parsed.rounds[6].venue, "Maccabi");
    assert.equal(parsed.rounds[6].home_away, "away");
    assert.equal(parsed.calendar.filter((c) => c.name === "No Play").length, 3);
    assert.ok(parsed.calendar.some((c) => c.name === "Grand Final"));
    parseResults(html("results"), name, parsed.rounds);
    assert.deepEqual(
        { ...parsed.rounds[11] },
        {
            number: 12,
            date: "2026-10-27",
            opponent: "Hurlingham Park Battlers",
            home_away: "home",
            venue: "Hurlingham Park",
            status: "completed",
            source_status: "",
            points_for: 5,
            points_against: 5,
            sets_for: 3,
            sets_against: 3,
            games_for: 27,
            games_against: 27,
            external_match: "TN001123",
        },
    );
    assert.equal(parsed.rounds[4].status, "washout");
    assert.equal(parsed.rounds[4].source_status, "Wash Out");
    assert.equal(parsed.rounds[2].source_status, "Bye");
    assert.equal(parsed.rounds[0].points_for, 4);
    assert.equal(parsed.rounds[0].points_against, 6);
    assert.equal(
        parseStandings(html("standings")).find((s) => s.name === name).rank,
        3,
    );
});
test("malformed/incomplete/changed source structures fail closed", () => {
    for (const invalid of [
        "",
        html("fixture").replace("Fixture for ", "Other "),
        html("fixture").replace("28 Jul 26", "31 Feb 26"),
        html("fixture").replace("pop_map", "broken_map"),
    ])
        assert.throws(() => parseFixture(invalid, name));
    assert.throws(() => parseResults("<html>Error</html>", name, []));
    assert.throws(() => parseStandings("<html>Error</html>"));
    const rounds = parseFixture(html("fixture"), name).rounds;
    assert.throws(() =>
        parseResults(
            html("results").replace("5.0&nbsp;", "oops&nbsp;"),
            name,
            rounds,
        ),
    );
    assert.throws(() => options('<select name="daytime"></select>', "daytime"));
    assert.throws(() => dateOf("31 Feb 26"));
    assert.throws(() => dateOf("not a date"));
});
test("discovery uses verified form parameters, source IDs and cached read-only responses", async () => {
    const requests = [];
    global.fetch = async (url, init) => {
        const p = init.body;
        requests.push({ url, params: Object.fromEntries(p) });
        return {
            ok: true,
            text: async () =>
                html(
                    p.get("section")
                        ? "teams"
                        : p.get("daytime")
                          ? "sections"
                          : "competitions",
                ),
        };
    };
    assert.equal(
        (await trols.options({ association: "brta" })).kind,
        "competitions",
    );
    const sections = await trols.options({
        association: "brta",
        competition: "TN",
    });
    assert.equal(sections.options[0].id, "TN001");
    const teams = await trols.options({
        association: "brta",
        competition: "TN",
        section: "TN001",
    });
    assert.ok(teams.options.some((t) => t.id === "TN004" && t.name === name));
    const mapping = await trols.resolve({
        association: "brta",
        competition: "TN",
        section: "TN001",
        team: "TN004",
    });
    assert.equal(mapping.season, "Spring 2026");
    assert.equal(mapping.name, name);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].params.which, "1");
    assert.equal(requests[2].params.section, "TN001");
    await assert.rejects(trols.options({ association: "other" }));
    await assert.rejects(
        trols.resolve({
            association: "brta",
            competition: "TN",
            section: "TN001",
            team: "madeup",
        }),
    );
});
test("snapshot fetches all sources freshly, verifies selection/season and rejects wrong or incomplete responses", async () => {
    const mapping = {
        provider: "trols",
        association: "brta",
        competition: "TN",
        section: "TN001",
        external_team: "TN004",
        season: "Spring 2026",
    };
    const requests = [];
    let changed = false;
    global.fetch = async (url, init) => {
        requests.push({ url, params: Object.fromEntries(init.body) });
        return {
            ok: true,
            text: async () =>
                html(
                    url.includes("fixture")
                        ? "fixture"
                        : url.includes("results")
                          ? "results"
                          : "standings",
                ).replaceAll(
                    changed ? "Spring 2026" : "will not match",
                    "Spring 2027",
                ),
        };
    };
    const result = await trols.snapshot(mapping);
    assert.equal(result.rounds.length, 14);
    assert.equal(result.standings.length, 7);
    assert.equal(requests[0].params.which, "2");
    assert.equal(requests[0].params.team, "TN004");
    changed = true;
    await assert.rejects(trols.snapshot(mapping), /season/);
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(trols.snapshot(mapping), /503/);
    global.fetch = async () => ({
        ok: true,
        text: async () => "<html>Maintenance</html>",
    });
    await assert.rejects(trols.snapshot(mapping));
});
