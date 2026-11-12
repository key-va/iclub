import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
process.env.VITE_PREFIX = "iclub-test";
let server, rounds;
before(async () => {
    server = await createServer({
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: "error",
        optimizeDeps: { noDiscovery: true },
    });
    rounds = await server.ssrLoadModule("/src/lib/rounds.ts");
});
after(async () => {
    await server?.close();
});
test("upcoming rounds use inverse roles and remain grouped by team, omitting old rounds, byes and official finishes", () => {
    const items = [];
    for (const [id, team, date, status, role] of [
        ["round_a", "team_one", "2026-11-17", "scheduled", "selected"],
        ["round_b", "team_two", "2026-11-16", "scheduled", "unavailable"],
        ["round_c", "team_one", "2026-10-01", "scheduled", "pending"],
        ["round_d", "team_one", "2026-11-18", "bye", "pending"],
        ["round_e", "team_one", "2026-11-19", "completed", "available"],
        ["round_f", "team_one", "2026-11-20", "postponed", "available"],
    ]) {
        items.push(
            { pk: "round", rk: id, date, status },
            { pk: team, rk: id },
            { pk: id, rk: team },
            { pk: "user_a", rk: id, role },
        );
    }
    assert.deepEqual(
        rounds
            .upcomingTeamRounds(items, "user_a", "team_one", "2026-11-12")
            .map((r) => [r.rk, r.relation.role]),
        [
            ["round_a", "selected"],
            ["round_f", "available"],
        ],
    );
    assert.deepEqual(
        rounds
            .upcomingTeamRounds(items, "user_a", "team_two", "2026-11-12")
            .map((r) => r.rk),
        ["round_b"],
    );
    assert.deepEqual(
        rounds.upcomingTeamRounds(
            items,
            "user_other",
            "team_one",
            "2026-11-12",
        ),
        [],
    );
});
test("role colours and result summaries match the contract, including zero scores and unknown result state", () => {
    assert.deepEqual(rounds.roundRoleColour, {
        selected: "green",
        available: "blue",
        unavailable: "red",
        pending: "grey",
    });
    assert.equal(
        rounds.officialResult({
            status: "completed",
            points_for: 0,
            points_against: 10,
            sets_for: 0,
            sets_against: 6,
            games_for: 17,
            games_against: 38,
        }),
        "0–10 points · 0–6 sets · 17–38 games",
    );
    assert.equal(rounds.officialResult({ status: "postponed" }), "postponed");
    assert.equal(rounds.isTeamMember("pending"), false);
    assert.equal(rounds.isTeamMember("is_admin"), true);
});

test("prefixed external values render through derived views and app lifecycle states drive upcoming rounds", () => {
    const items = [
        {
            pk: "round",
            rk: "round_new",
            name: "Royals vs Lobs",
            state: "pending",
            ext_number: 1,
            ext_date: "2026-11-17",
            ext_opponent: "Royals",
            ext_venue: "Kings Park",
        },
        {
            pk: "round",
            rk: "round_done",
            state: "complete",
            ext_number: 2,
            ext_date: "2026-11-18",
            ext_points_for: 7,
            ext_points_against: 3,
        },
        {
            pk: "round",
            rk: "round_bye",
            state: "complete",
            ext_number: 3,
            ext_date: "2026-11-19",
        },
        { pk: "team_a", rk: "round_new" },
        { pk: "team_a", rk: "round_done", result: "winner" },
        { pk: "team_a", rk: "round_bye", result: "bye" },
        { pk: "user_a", rk: "round_new", role: "available" },
        { pk: "user_a", rk: "round_done", role: "selected" },
        { pk: "user_a", rk: "round_bye", role: "pending" },
    ];
    const upcoming = rounds.upcomingTeamRounds(
        items,
        "user_a",
        "team_a",
        "2026-11-12",
    );
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].date, "2026-11-17");
    assert.equal(upcoming[0].opponent, "Royals");
    assert.equal(upcoming[0].state, "pending");
    assert.equal(upcoming[0].relation.role, "available");
    assert.equal(rounds.officialResult(items[1], items[4]), "7–3 points");
    assert.equal(rounds.officialResult(items[2], items[5]), "bye");
    assert.equal(
        rounds.officialResult({ state: "pending", ext_status: "Postponed" }),
        "postponed",
    );
    assert.equal(items[0].date, undefined); // aliases do not mutate/duplicate the shared dataset
});

test("team view handles both prefixed and legacy standings without persisting aliases", () => {
    const source = {
        pk: "team",
        rk: "team_a",
        name: "Lobs",
        state: "active",
        ext_competition_name: "Tuesday Night",
        ext_section_name: "Section 1",
        ext_standings: '[{"name":"Lobs","rank":1}]',
    };
    const view = rounds.teamView(source);
    assert.equal(view.competition_name, "Tuesday Night");
    assert.equal(view.section_name, "Section 1");
    assert.equal(view.standings, source.ext_standings);
    assert.equal(source.standings, undefined);
    const legacy = rounds.roundView({
        pk: "round",
        rk: "round_old",
        status: "completed",
        points_for: 5,
        points_against: 5,
    });
    assert.equal(legacy.state, "complete");
    assert.equal(legacy.result, "draw");
    assert.equal(legacy.status, undefined);
});

test("round views read the owning team relation outcome without changing public entity rows", () => {
    const entity = {
        pk: "round",
        rk: "round_a",
        state: "complete",
        ext_number: 1,
        ext_points_for: 2,
        ext_points_against: 8,
    };
    const forward = { pk: "team_a", rk: "round_a", result: "loser" };
    const inverse = { pk: "round_a", rk: "team_a", result: "loser" };
    assert.equal(
        rounds.roundView({ ...entity, relation: forward }, forward).result,
        "loser",
    );
    assert.equal(rounds.roundView(entity, inverse).result, "loser");
    assert.equal(entity.result, undefined);
    assert.equal(
        rounds.roundView({ ...entity, result: "winner" }, inverse).result,
        "loser",
    );
    assert.equal(
        rounds.officialResult(
            {
                ...entity,
                ext_points_for: undefined,
                ext_points_against: undefined,
            },
            { ...inverse, result: "washout" },
        ),
        "washout",
    );
});
