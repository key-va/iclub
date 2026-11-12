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
