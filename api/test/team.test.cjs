process.env.RESOURCE_GROUP_PREFIX = "iclub-test";
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
const rows = new Map(),
    pushes = [];
let failTeamRoundMirror = false;
let rejectSignature = false,
    failPush = false,
    failFetch = false,
    exportCount = 0;
const key = (a, b) => `${a}|${b}`;
const entity = (pk, rk, attrs = {}) =>
    rows.set(key(pk, rk), {
        partitionKey: pk,
        rowKey: rk,
        etag: String(Math.random()),
        ...attrs,
    });
const relation = (a, b, attrs = {}) => {
    entity(a, b, attrs);
    entity(b, a, attrs);
};
const get = (a, b) => rows.get(key(a, b));
class TableClient {
    async getEntity(pk, rk) {
        const row = get(pk, rk);
        if (!row) throw Object.assign(Error("missing"), { statusCode: 404 });
        return { ...row };
    }
    async upsertEntity(row) {
        if (
            failTeamRoundMirror &&
            row.partitionKey.startsWith("round_") &&
            row.rowKey === T
        )
            throw Error("Simulated inverse write failure");
        entity(row.partitionKey, row.rowKey, row);
    }
    async updateEntity(row, mode, options) {
        const old = get(row.partitionKey, row.rowKey);
        if (!old) throw { statusCode: 404 };
        if (options?.etag && options.etag !== old.etag)
            throw { statusCode: 412 };
        entity(row.partitionKey, row.rowKey, {
            ...old,
            ...row,
            etag: String(Math.random()),
        });
    }
    async *listEntities({ queryOptions: { filter } }) {
        const fields = [...filter.text.matchAll(/(PartitionKey|url) eq /g)].map(
            (m) => (m[1] === "PartitionKey" ? "partitionKey" : m[1]),
        );
        for (const row of [...rows.values()])
            if (fields.every((f, i) => row[f] === filter.values[i]))
                yield { ...row };
    }
}
const mapping = {
    provider: "trols",
    association: "brta",
    competition: "TN",
    competition_name: "Tuesday Night - Spring 2026",
    section: "TN001",
    section_name: "Section 1",
    external_team: "TN004",
    season: "Spring 2026",
    name: "Lobs",
};
let source;
const provider = {
    options: async () => ({
        kind: "teams",
        options: [{ id: "TN004", name: "Lobs" }],
    }),
    resolve: async (data) => {
        if (data.team !== "TN004") throw Error("Unknown team");
        return { ...mapping };
    },
    snapshot: async () => {
        if (failFetch) throw Error("TROLS down");
        return structuredClone(source);
    },
};
Module._load = function (id) {
    if (id === "@azure/functions") return { app: { http() {} } };
    if (id === "@azure/identity") return { DefaultAzureCredential: class {} };
    if (id === "@azure/data-tables")
        return {
            TableClient,
            odata: (strings, ...values) => ({ text: strings.join(""), values }),
        };
    if (id.endsWith("/doSignatureVerification"))
        return {
            doSignatureVerification: async () => {
                if (rejectSignature) throw Error("bad");
            },
        };
    if (id.endsWith("/doGuidsToPublic"))
        return {
            doGuidsToPublic: async () => {
                exportCount++;
            },
        };
    if (id.endsWith("/doSendPush"))
        return {
            doSendPush: async (p) => {
                pushes.push(p);
                if (failPush) throw Error("Push down");
                return true;
            },
        };
    if (id.endsWith("/doAssetToPublic"))
        return { doAssetToPublic: async () => {} };
    if (id.endsWith("/trols")) return { providerFor: () => provider };
    return originalLoad.apply(this, arguments);
};
const { teamAction, roundRole } = require("../dist/src/functions/team");
const { messageCreate } = require("../dist/src/functions/messageCreate");
const { doSyncTeam } = require("../dist/src/services/doSyncTeam");
const context = { log() {}, warn() {}, error() {} };
const C = "club_c",
    T = "team_t",
    U = "user_u",
    A = "user_a",
    B = "user_b",
    CLUBADMIN = "user_clubadmin",
    OUT = "user_out";
const request = (caller, data, params = {}) => ({
    params,
    url: "https://api.test/api",
    headers: new Headers({ origin: "https://hptc.intra.club" }),
    json: async () => ({
        caller_id: caller,
        device_id: "device_x",
        signature: "test",
        data,
    }),
});
const call = (action, caller, data = {}) =>
    teamAction(action, request(caller, { team_id: T, ...data }), context);
const role = (caller, user, next, id = "round_r") =>
    roundRole(
        request(caller, { round_id: id, user_id: user, role: next }),
        context,
    );
function seed(state = "active") {
    entity("club", C, { url: "hptc.intra.club" });
    relation(C, CLUBADMIN, { is_admin: true });
    for (const id of [U, A, B, CLUBADMIN, OUT])
        entity("user", id, { name: id });
    entity("team", T, { ...mapping, state, club_id: C, requested_by: A });
    relation(T, C);
    relation(
        T,
        A,
        state === "pending" ? { state: "pending" } : { role: "is_admin" },
    );
}
function round() {
    entity("round", "round_r", {
        name: "Round 14",
        number: 14,
        date: "2026-11-17",
        status: "scheduled",
    });
    relation(T, "round_r");
    for (const id of [A, U, B]) {
        relation(T, id, { role: id === A ? "is_admin" : "is_member" });
        relation("round_r", id, { role: "pending" });
    }
}
function mirrored() {
    for (const r of rows.values())
        if (r.partitionKey.includes("_")) {
            const mirror = get(r.rowKey, r.partitionKey);
            assert.ok(mirror);
            const clean = ({ partitionKey, rowKey, etag, ...a }) => a;
            assert.deepEqual(clean(r), clean(mirror));
        }
}
beforeEach(() => {
    rows.clear();
    pushes.length = 0;
    failTeamRoundMirror = false;
    rejectSignature = false;
    failPush = false;
    failFetch = false;
    exportCount = 0;
    source = {
        rounds: [
            {
                number: 1,
                date: "2026-11-17",
                opponent: "Royals",
                home_away: "home",
                venue: "Hurlingham Park",
                status: "scheduled",
            },
        ],
        standings: [
            { name: "Lobs", rank: 1, wins: 0, points: 0, percentage: 0 },
        ],
        calendar: [],
    };
});
after(() => (Module._load = originalLoad));
test("options do not write; signed creation resolves host club, validates selection and rejects duplicate requests", async () => {
    seed();
    rows.delete(key("team", T));
    rows.delete(key(C, T));
    rows.delete(key(T, C));
    rows.delete(key(T, A));
    rows.delete(key(A, T));
    const before = rows.size;
    assert.equal(
        (await call("options", undefined, { association: "brta" })).status,
        200,
    );
    assert.equal(rows.size, before);
    assert.equal(exportCount, 0);
    const data = {
        association: "brta",
        competition: "TN",
        section: "TN001",
        team: "TN004",
        club_id: "club_wrong",
    };
    const result = await call("create", A, data);
    assert.equal(result.status, 201);
    const id = result.jsonBody.subject;
    assert.equal(get("team", id).state, "pending");
    assert.equal(get("team", id).ext_provider, "trols");
    assert.equal(get("team", id).ext_competition, "TN");
    assert.equal(get("team", id).ext_team, "TN004");
    assert.equal(get("team", id).provider, undefined);
    assert.equal(get("team", id).club_id, undefined);
    assert.ok(get(id, C));
    assert.ok(get(C, id));
    assert.equal(get(id, A).state, undefined);
    assert.equal(get(id, A).is_admin, true);
    assert.equal(get(A, id).is_admin, true);
    assert.equal(get(id, A).role, undefined);
    assert.equal((await call("create", A, data)).status, 409);
    assert.equal(
        (await call("create", A, { ...data, team: "wrong" })).status,
        400,
    );
    rejectSignature = true;
    assert.equal((await call("create", A, data)).status, 401);
    mirrored();
});
test("only associated club admin activates; fetch failure leaves pending; approval imports rounds and promotes requester", async () => {
    seed("pending");
    assert.equal((await call("activate", A)).status, 403);
    assert.equal((await call("activate", OUT)).status, 403);
    failFetch = true;
    assert.equal((await call("activate", CLUBADMIN)).status, 502);
    assert.equal(get("team", T).state, "pending");
    assert.equal(
        [...rows.values()].filter((r) => r.partitionKey === "round").length,
        0,
    );
    failFetch = false;
    assert.equal((await call("activate", CLUBADMIN)).status, 200);
    assert.equal(get("team", T).state, "active");
    assert.equal(get(T, A).is_admin, true);
    assert.equal(get(A, T).is_admin, true);
    assert.equal(get(T, A).role, undefined);
    const r = [...rows.values()].find((r) => r.partitionKey === "round");
    assert.equal(get(r.rowKey, A).role, "pending");
    assert.equal(get(A, r.rowKey).role, "pending");
    assert.equal((await call("activate", CLUBADMIN)).status, 409);
    mirrored();
});
test("membership requests require active team; only team admin accepts and all existing rounds get role-only pending links", async () => {
    seed("pending");
    assert.equal((await call("join", U)).status, 409);
    get("team", T).state = "active";
    get(T, A).role = "is_admin";
    get(A, T).role = "is_admin";
    round();
    rows.delete(key(T, U));
    rows.delete(key(U, T));
    rows.delete(key("round_r", U));
    rows.delete(key(U, "round_r"));
    assert.equal((await call("join", U)).status, 200);
    assert.equal(get(T, U).state, "pending");
    assert.equal((await call("join", U)).status, 409);
    assert.equal((await call("accept", CLUBADMIN, { user_id: U })).status, 403);
    assert.equal((await call("accept", A, { user_id: OUT })).status, 409);
    assert.equal((await call("accept", A, { user_id: U })).status, 200);
    assert.equal(get(T, U).role, "is_member");
    assert.equal(get(T, U).state, undefined);
    assert.deepEqual(
        Object.keys(get("round_r", U)).filter(
            (k) => !["partitionKey", "rowKey", "etag"].includes(k),
        ),
        ["role"],
    );
    assert.equal(get(U, "round_r").role, "pending");
    mirrored();
});
test("all own availability transitions work and exact selected-to-unavailable notification targets all approved members", async () => {
    seed();
    round();
    relation(T, OUT, { state: "pending" });
    for (const old of ["pending", "available", "unavailable", "selected"])
        for (const next of ["pending", "available", "unavailable"]) {
            relation("round_r", U, { role: old });
            pushes.length = 0;
            const response = await role(U, U, next);
            assert.equal(response.status, 200, `${old} -> ${next}`);
            assert.equal(get("round_r", U).role, next);
            assert.equal(get(U, "round_r").role, next);
            assert.equal(
                pushes.length,
                old === "selected" && next === "unavailable" ? 1 : 0,
            );
            if (pushes.length) {
                const p = pushes[0];
                assert.deepEqual(new Set(p.userIds), new Set([A, U, B]));
                assert.match(p.heading, /Lobs/);
                assert.match(p.content, /Round 14.*replacement/i);
                assert.equal(p.path, "round/round_r");
                assert.equal(p.exceptUserId, undefined);
            }
        }
    relation("round_r", U, { role: "selected" });
    pushes.length = 0;
    assert.equal((await role(U, U, "unavailable")).status, 200);
    assert.equal((await role(U, U, "unavailable")).status, 200);
    assert.equal(pushes.length, 1);
    mirrored();
});
test("selection authority and transitions reject outsiders, self selection, unavailable/pending selections and arbitrary admin availability edits", async () => {
    seed();
    round();
    for (const old of ["pending", "unavailable"]) {
        relation("round_r", U, { role: old });
        assert.equal((await role(A, U, "selected")).status, 409);
    }
    relation("round_r", U, { role: "available" });
    assert.equal((await role(U, U, "selected")).status, 403);
    assert.equal((await role(B, U, "selected")).status, 403);
    assert.equal((await role(CLUBADMIN, U, "selected")).status, 403);
    assert.equal((await role(A, A, "selected")).status, 403);
    assert.equal((await role(OUT, U, "unavailable")).status, 403);
    assert.equal((await role(A, U, "pending")).status, 403);
    assert.equal((await role(A, U, "selected")).status, 200);
    assert.equal((await role(A, U, "selected")).status, 200);
    assert.equal((await role(A, U, "available")).status, 200);
    assert.equal(get(U, "round_r").role, "available");
    assert.equal((await role(A, OUT, "selected")).status, 403);
    assert.equal((await role(U, U, "anything")).status, 400);
    rejectSignature = true;
    assert.equal((await role(U, U, "available")).status, 401);
    mirrored();
});
test("push failures never undo persisted role; ordinary updates and noops do not push", async () => {
    seed();
    round();
    relation("round_r", U, { role: "selected" });
    failPush = true;
    assert.equal((await role(U, U, "unavailable")).status, 200);
    assert.equal(get("round_r", U).role, "unavailable");
    assert.equal(get(U, "round_r").role, "unavailable");
    assert.equal(pushes.length, 1);
    assert.equal((await role(U, U, "unavailable")).status, 200);
    assert.equal(pushes.length, 1);
    assert.ok(exportCount > 0);
});
test("concurrent selected-to-unavailable requests emit one notification; entity leases reject overlapping mutations", async () => {
    seed();
    round();
    relation("round_r", U, { role: "selected" });
    const replies = await Promise.all([
        role(U, U, "unavailable"),
        role(U, U, "unavailable"),
    ]);
    assert.equal(replies.filter((r) => r.status === 200).length, 1);
    assert.equal(pushes.length, 1);
    get("team", T).operation_until = Date.now() + 60000;
    assert.equal((await call("sync", A)).status, 409);
});
test("manual sync preserves round IDs, postponement identity, memberships, roles, messages and old valid results", async () => {
    seed();
    relation(T, U, { role: "is_member" });
    assert.equal((await call("sync", OUT)).status, 403);
    assert.equal((await call("sync", CLUBADMIN)).status, 403);
    assert.equal((await call("sync", A)).status, 200);
    const r = [...rows.values()].find((r) => r.partitionKey === "round");
    const id = r.rowKey;
    relation(id, U, { role: "selected" });
    entity("message", "message_m", { name: "See you" });
    relation(id, "message_m");
    source.rounds[0].date = "2026-11-24";
    source.rounds[0].status = "postponed";
    source.rounds.push({
        number: 2,
        date: "2026-12-01",
        opponent: "Bye",
        home_away: "",
        venue: "",
        status: "bye",
    });
    const sync = await call("sync", A);
    assert.equal(sync.status, 200);
    assert.equal(sync.jsonBody.data.created, 1);
    assert.equal(sync.jsonBody.data.updated, 1);
    assert.equal(get("round", id).ext_date, "2026-11-24");
    assert.equal(get(id, U).role, "selected");
    assert.ok(get(id, "message_m"));
    assert.equal(get(T, U).role, "is_member");
    const newRound = [...rows.values()].find(
        (r) => r.partitionKey === "round" && r.rowKey !== id,
    );
    assert.equal(get(newRound.rowKey, U).role, "pending");
    source.rounds[0].status = "completed";
    source.rounds[0].points_for = 7;
    source.rounds[0].points_against = 3;
    await call("sync", A);
    delete source.rounds[0].points_for;
    delete source.rounds[0].points_against;
    source.rounds[0].status = "scheduled";
    await call("sync", A);
    assert.equal(get("round", id).state, "complete");
    assert.equal(get("round", id).ext_points_for, 7);
    failFetch = true;
    const before = JSON.stringify(
        [...rows].filter(([k]) => k.startsWith("round|")),
    );
    assert.equal((await call("sync", A)).status, 502);
    assert.equal(
        JSON.stringify([...rows].filter(([k]) => k.startsWith("round|"))),
        before,
    );
    mirrored();
});
test("same external encounter owned by two Intra Club teams creates different internal rounds", async () => {
    seed();
    await doSyncTeam(T);
    entity("team", "team_other", { ...mapping, state: "active" });
    relation("team_other", B, { role: "is_member" });
    await doSyncTeam("team_other");
    const rounds = [...rows.values()].filter((r) => r.partitionKey === "round");
    assert.equal(rounds.length, 2);
    assert.notEqual(rounds[0].rowKey, rounds[1].rowKey);
    assert.equal(rounds[0].external_key, rounds[1].external_key);
    assert.ok(get(rounds.find((r) => get("team_other", r.rowKey)).rowKey, B));
    mirrored();
});
test("signed non-members may post round messages; sync preserves them and signatures still apply", async () => {
    seed();
    await doSyncTeam(T);
    const r = [...rows.values()].find((r) => r.partitionKey === "round");
    const response = await messageCreate(
        request(OUT, { round_id: r.rowKey, text: "Good luck!" }),
        context,
    );
    assert.equal(response.status, 201);
    const id = response.jsonBody.data.message_id;
    assert.ok(get(r.rowKey, id));
    assert.equal(get(id, OUT).role, "sender");
    await doSyncTeam(T);
    assert.ok(get(r.rowKey, id));
    rejectSignature = true;
    assert.equal(
        (
            await messageCreate(
                request(OUT, { round_id: r.rowKey, text: "Hello" }),
                context,
            )
        ).status,
        401,
    );
    mirrored();
});

test("retry after interrupted ownership/membership mirrors repairs links while preserving round ID and response", async () => {
    seed();
    relation(T, U, { role: "is_member" });
    await doSyncTeam(T);
    const round = [...rows.values()].find((r) => r.partitionKey === "round");
    rows.delete(key(T, round.rowKey));
    relation(round.rowKey, U, { role: "available" });
    rows.delete(key(U, round.rowKey));
    await doSyncTeam(T);
    assert.equal(
        [...rows.values()].filter((r) => r.partitionKey === "round").length,
        1,
    );
    assert.ok(get(T, round.rowKey));
    assert.equal(get(U, round.rowKey).role, "available");
    rows.delete(key(round.rowKey, U));
    rows.delete(key(U, round.rowKey));
    assert.equal((await call("accept", A, { user_id: U })).status, 200);
    assert.equal(get(U, round.rowKey).role, "pending");
    mirrored();
});

test("club approval can recover an interrupted activation before initial sync completed", async () => {
    seed("active");
    relation(T, A, { state: "pending" });
    assert.equal((await call("activate", CLUBADMIN)).status, 200);
    assert.equal(get(T, A).is_admin, true);
    assert.equal(get(A, T).is_admin, true);
    assert.equal(get(T, A).role, undefined);
    assert.ok(get("team", T).last_synced);
    mirrored();
});

test("duplicate detection includes an incomplete team creation with no club relation", async () => {
    seed();
    rows.delete(key(T, C));
    rows.delete(key(C, T));
    const result = await call("create", A, {
        association: "brta",
        competition: "TN",
        section: "TN001",
        team: "TN004",
    });
    assert.equal(result.status, 409);
    assert.equal(result.jsonBody.subject, T);
});

test("sync names rounds by number and opponent and stores ownership only in mirrored relations", async () => {
    seed();
    await doSyncTeam(T);
    const r = [...rows.values()].find((row) => row.partitionKey === "round");
    assert.equal(r.name, "Round 1 vs Royals");
    assert.equal(Object.hasOwn(r, "team_id"), false);
    assert.ok(get(T, r.rowKey));
    assert.ok(get(r.rowKey, T));
    source.rounds[0].home_away = "away";
    source.rounds[0].date = "2026-11-24";
    await doSyncTeam(T);
    assert.equal(get("round", r.rowKey).name, "Round 1 vs Royals");
    assert.equal(get("round", r.rowKey).ext_date, "2026-11-24");
    assert.equal(
        [...rows.values()].filter((row) => row.partitionKey === "round").length,
        1,
    );
    mirrored();
});

test("refresh removes legacy ownership attribute and renames in place, retaining roles and messages", async () => {
    seed();
    relation(T, U, { role: "is_member" });
    await doSyncTeam(T);
    const r = [...rows.values()].find((row) => row.partitionKey === "round");
    r.team_id = T;
    r.name = "Round 1 — Royals";
    relation(r.rowKey, U, { role: "selected" });
    entity("message", "message_existing", { name: "On my way" });
    relation(r.rowKey, "message_existing");
    // A legacy import may have been interrupted before either owning relation was written.
    rows.delete(key(T, r.rowKey));
    rows.delete(key(r.rowKey, T));
    const summary = await doSyncTeam(T);
    assert.equal(summary.created, 0);
    assert.equal(summary.updated, 1);
    const migrated = get("round", r.rowKey);
    assert.equal(migrated.name, "Round 1 vs Royals");
    assert.equal(Object.hasOwn(migrated, "team_id"), false);
    assert.equal(get(r.rowKey, U).role, "selected");
    assert.ok(get(r.rowKey, "message_existing"));
    assert.ok(get(T, r.rowKey));
    assert.ok(get(r.rowKey, T));
    mirrored();
});

test("round role permissions follow graph ownership even if a legacy attribute claims another team", async () => {
    seed();
    round();
    entity("team", "team_wrong", { state: "active" });
    get("round", "round_r").team_id = "team_wrong";
    assert.equal((await role(U, U, "available")).status, 200);
    assert.equal(get("round_r", U).role, "available");
    rows.delete(key("round_r", T));
    rows.delete(key(T, "round_r"));
    get("round", "round_r").team_id = T;
    assert.equal((await role(U, U, "unavailable")).status, 409);
    assert.equal(get("round_r", U).role, "available");
});

test("migration retains omitted legacy rounds and does not let their deprecated attribute steal graph ownership", async () => {
    seed();
    source.rounds.push({
        ...source.rounds[0],
        number: 2,
        opponent: "Other team",
    });
    await doSyncTeam(T);
    const omitted = [...rows.values()].find(
        (row) => row.partitionKey === "round" && row.ext_number === 2,
    );
    omitted.team_id = T;
    omitted.name = "Round 2 — Other team";
    source.rounds.pop();
    await doSyncTeam(T);
    assert.equal(get("round", omitted.rowKey).name, "Round 2 vs Other team");
    assert.equal(get("round", omitted.rowKey).team_id, undefined);
    assert.equal(get("round", omitted.rowKey).ext_date, "2026-11-17");
    const other = "team_other";
    entity("team", other, { ...mapping, state: "active" });
    relation(other, B, { role: "is_member" });
    get("round", omitted.rowKey).team_id = other;
    await doSyncTeam(other);
    assert.equal(get(other, omitted.rowKey), undefined);
    assert.ok(get(T, omitted.rowKey));
    mirrored();
});

test("source attributes use ext_ while rounds expose normalized app state/result without synthetic external statuses", async () => {
    seed();
    source.rounds = [
        {
            number: 1,
            date: "2026-11-17",
            opponent: "Royals",
            venue: "Hurlingham Park",
            home_away: "home",
            status: "scheduled",
            source_status: "",
        },
        {
            number: 2,
            date: "2026-11-18",
            opponent: "Battlers",
            venue: "Hurlingham Park",
            home_away: "away",
            status: "completed",
            source_status: "",
            points_for: 7,
            points_against: 3,
            sets_for: 4,
            sets_against: 2,
            games_for: 33,
            games_against: 27,
            external_match: "TN001123",
        },
        {
            number: 3,
            date: "2026-11-19",
            opponent: "Bye",
            venue: "",
            home_away: "",
            status: "bye",
            source_status: "Bye",
        },
        {
            number: 4,
            date: "2026-11-20",
            opponent: "Other",
            venue: "Kings Park",
            home_away: "away",
            status: "washout",
            source_status: "Wash Out",
        },
        {
            number: 5,
            date: "2026-11-21",
            opponent: "Other",
            venue: "Kings Park",
            home_away: "away",
            status: "postponed",
            source_status: "Postponed",
        },
    ];
    await doSyncTeam(T);
    const rounds = [...rows.values()]
        .filter((row) => row.partitionKey === "round")
        .sort((a, b) => a.ext_number - b.ext_number);
    assert.deepEqual(
        rounds.map((r) => r.state),
        ["pending", "complete", "complete", "complete", "pending"],
    );
    assert.deepEqual(
        rounds.map((r) => get(T, r.rowKey).result),
        [undefined, "winner", "bye", "washout", undefined],
    );
    for (const r of rounds) {
        assert.equal(r.result, undefined);
        assert.equal(get(T, r.rowKey).result, get(r.rowKey, T).result);
        assert.equal(r.status, undefined);
        assert.equal(r.number, undefined);
        assert.equal(r.date, undefined);
        assert.equal(r.opponent, undefined);
        assert.equal(r.venue, undefined);
        assert.equal(r.provider, undefined);
        assert.ok(r.ext_date);
        assert.ok(r.ext_opponent);
        assert.equal(r.ext_provider, "trols");
    }
    assert.equal(rounds[0].ext_status, undefined);
    assert.equal(rounds[1].ext_status, undefined);
    assert.equal(rounds[2].ext_status, "Bye");
    assert.equal(rounds[3].ext_status, "Wash Out");
    assert.equal(rounds[4].ext_status, "Postponed");
    assert.equal(rounds[1].ext_match, "TN001123");
    assert.equal(rounds[1].ext_points_for, 7);
    assert.equal(rounds[1].points_for, undefined);
    const team = get("team", T);
    for (const field of [
        "provider",
        "association",
        "competition",
        "section",
        "external_team",
        "season",
        "standings",
        "calendar",
        "rank",
        "wins",
        "points",
        "percentage",
    ])
        assert.equal(team[field], undefined, field);
    assert.equal(team.ext_team, "TN004");
    assert.equal(team.ext_competition, "TN");
    assert.equal(team.name, "Lobs");
    assert.equal(team.state, "active");
    assert.equal(team.ext_name, "Lobs");
    assert.ok(team.ext_standings);
    assert.equal((await doSyncTeam(T)).updated, 0);
    mirrored();
});

test("legacy field migration preserves IDs, scores, source mapping, availability and messages; duplicates still fail", async () => {
    seed();
    relation(T, U, { role: "is_member" });
    const legacyId = "round_legacy";
    const { externalRoundKey } = require("../dist/src/services/doSyncTeam");
    entity("round", legacyId, {
        name: "Royals vs Lobs",
        external_key: externalRoundKey(mapping, 1),
        provider: "trols",
        number: 1,
        date: "2026-11-17",
        opponent: "Royals",
        home_away: "home",
        venue: "Hurlingham Park",
        status: "completed",
        points_for: 7,
        points_against: 3,
    });
    relation(T, legacyId);
    relation(legacyId, U, { role: "selected" });
    entity("message", "message_legacy", { name: "Hello" });
    relation(legacyId, "message_legacy");
    const summary = await doSyncTeam(T);
    assert.equal(summary.created, 0);
    assert.equal(summary.updated, 1);
    const migrated = get("round", legacyId);
    assert.equal(migrated.state, "complete");
    assert.equal(migrated.result, undefined);
    assert.equal(get(T, legacyId).result, "winner");
    assert.equal(get(legacyId, T).result, "winner");
    assert.equal(migrated.ext_points_for, 7);
    assert.equal(migrated.points_for, undefined);
    assert.equal(migrated.status, undefined);
    assert.equal(migrated.ext_status, undefined);
    assert.equal(get(legacyId, U).role, "selected");
    assert.ok(get(legacyId, "message_legacy"));
    assert.equal(
        (
            await call("create", A, {
                association: "brta",
                competition: "TN",
                section: "TN001",
                team: "TN004",
            })
        ).status,
        409,
    );
    mirrored();
});

test("outcome migration preserves entity IDs and local relationships, and retains unrelated team-round attributes", async () => {
    seed();
    relation(T, U, { role: "is_member" });
    source.rounds[0] = {
        ...source.rounds[0],
        status: "completed",
        points_for: 7,
        points_against: 3,
    };
    await doSyncTeam(T);
    const r = [...rows.values()].find((row) => row.partitionKey === "round");
    r.result = "winner";
    relation(T, r.rowKey, { note: "team-specific information" });
    relation(r.rowKey, U, { role: "selected" });
    entity("message", "message_result", { name: "Hello" });
    relation(r.rowKey, "message_result");
    // A legacy round omitted from the next response must still be migrated.
    source.rounds = [
        {
            ...source.rounds[0],
            number: 2,
            status: "scheduled",
            points_for: undefined,
            points_against: undefined,
        },
    ];
    await doSyncTeam(T);
    assert.equal(get("round", r.rowKey).result, undefined);
    assert.equal(get("round", r.rowKey).state, "complete");
    assert.equal(get(T, r.rowKey).result, "winner");
    assert.equal(get(r.rowKey, T).result, "winner");
    assert.equal(get(T, r.rowKey).note, "team-specific information");
    assert.equal(get(r.rowKey, T).note, "team-specific information");
    assert.equal(get(r.rowKey, U).role, "selected");
    assert.ok(get(r.rowKey, "message_result"));
    mirrored();
});

test("missing result responses preserve relation outcomes and a later result correction updates both mirrors", async () => {
    seed();
    source.rounds[0] = {
        ...source.rounds[0],
        status: "completed",
        points_for: 3,
        points_against: 7,
    };
    await doSyncTeam(T);
    const r = [...rows.values()].find((row) => row.partitionKey === "round");
    assert.equal(get(T, r.rowKey).result, "loser");
    assert.equal(get("round", r.rowKey).result, undefined);
    source.rounds[0] = {
        number: 1,
        date: "2026-11-17",
        opponent: "Royals",
        home_away: "home",
        venue: "Hurlingham Park",
        status: "scheduled",
    };
    await doSyncTeam(T);
    assert.equal(get(T, r.rowKey).result, "loser");
    assert.equal(get(r.rowKey, T).result, "loser");
    source.rounds[0] = {
        ...source.rounds[0],
        status: "completed",
        points_for: 5,
        points_against: 5,
    };
    await doSyncTeam(T);
    assert.equal(get(T, r.rowKey).result, "draw");
    assert.equal(get(r.rowKey, T).result, "draw");
    assert.equal(get("round", r.rowKey).result, undefined);
    mirrored();
});

test("an interrupted outcome mirror write retains the legacy entity result for a safe retry", async () => {
    seed();
    source.rounds[0] = {
        ...source.rounds[0],
        status: "completed",
        points_for: 7,
        points_against: 3,
    };
    await doSyncTeam(T);
    const r = [...rows.values()].find((row) => row.partitionKey === "round");
    r.result = "winner";
    r.home_away = "home";
    relation(T, r.rowKey);
    failTeamRoundMirror = true;
    await assert.rejects(doSyncTeam(T), /inverse write failure/);
    assert.equal(get("round", r.rowKey).result, "winner");
    assert.equal(get("round", r.rowKey).home_away, "home");
    assert.equal(get(T, r.rowKey).result, "winner");
    failTeamRoundMirror = false;
    await doSyncTeam(T);
    assert.equal(get("round", r.rowKey).result, undefined);
    assert.equal(get(T, r.rowKey).result, "winner");
    assert.equal(get(r.rowKey, T).result, "winner");
    mirrored();
});

test("home and away are mirrored boolean is_home values with no direction field on round entities", async () => {
    seed();
    source.rounds.push({ ...source.rounds[0], number: 2, home_away: "away" });
    source.rounds.push({
        ...source.rounds[0],
        number: 3,
        opponent: "Bye",
        home_away: "",
        venue: "",
        status: "bye",
    });
    await doSyncTeam(T);
    const rounds = [...rows.values()]
        .filter((row) => row.partitionKey === "round")
        .sort((a, b) => a.ext_number - b.ext_number);
    assert.deepEqual(
        rounds.map((r) => get(T, r.rowKey).is_home),
        [true, false, false],
    );
    for (const r of rounds) {
        assert.equal(r.home_away, undefined);
        assert.equal(r.is_home, undefined);
        assert.equal(get(r.rowKey, T).is_home, get(T, r.rowKey).is_home);
        assert.equal(get(T, r.rowKey).home_away, undefined);
    }
    const id = rounds[0].rowKey;
    source.rounds[0].home_away = "away";
    const summary = await doSyncTeam(T);
    assert.equal(get(T, id).is_home, false);
    assert.equal(get(id, T).is_home, false);
    assert.equal(summary.updated, 1);
    assert.equal((await doSyncTeam(T)).updated, 0);
    mirrored();
});

test("legacy directions migrate to the team-round relation even for omitted rounds, preserving outcome and other links", async () => {
    seed();
    relation(T, U, { role: "is_member" });
    await doSyncTeam(T);
    const r = [...rows.values()].find((row) => row.partitionKey === "round");
    r.home_away = "away";
    relation(T, r.rowKey, { note: "Keep this" });
    relation(r.rowKey, U, { role: "selected" });
    entity("message", "message_home", { name: "Hello" });
    relation(r.rowKey, "message_home");
    source.rounds = [{ ...source.rounds[0], number: 2 }];
    await doSyncTeam(T);
    assert.equal(get("round", r.rowKey).home_away, undefined);
    assert.equal(get("round", r.rowKey).is_home, undefined);
    assert.equal(get(T, r.rowKey).is_home, false);
    assert.equal(get(r.rowKey, T).is_home, false);
    assert.equal(get(T, r.rowKey).note, "Keep this");
    assert.equal(get(r.rowKey, U).role, "selected");
    assert.ok(get(r.rowKey, "message_home"));
    mirrored();
});

test("new team requests and approval use club/admin relations and leave only team attributes on the entity", async () => {
    seed();
    for (const [k, row] of [...rows])
        if (row.rowKey === T || row.partitionKey === T) rows.delete(k);
    const created = await call("create", A, {
        association: "brta",
        competition: "TN",
        section: "TN001",
        team: "TN004",
    });
    assert.equal(created.status, 201);
    const id = created.jsonBody.subject;
    const pending = get("team", id);
    assert.equal(pending.state, "pending");
    assert.equal(pending.club_id, undefined);
    assert.equal(pending.requested_by, undefined);
    assert.equal(pending.operation_until, undefined);
    assert.equal(pending.operation_guard, 0);
    assert.ok(pending.external_key);
    assert.ok(get(id, C));
    assert.ok(get(C, id));
    assert.equal(get(id, A).is_admin, true);
    assert.equal(get(A, id).is_admin, true);
    assert.equal(get(id, A).role, undefined);
    assert.equal((await call("activate", A, { team_id: id })).status, 403);
    assert.equal(
        (await call("activate", CLUBADMIN, { team_id: id })).status,
        200,
    );
    assert.equal((await call("join", U, { team_id: id })).status, 200);
    assert.equal(
        (await call("accept", A, { team_id: id, user_id: U })).status,
        200,
    );
    const round = [...rows.values()].find(
        (row) => row.partitionKey === "round",
    );
    assert.equal((await role(U, U, "available", round.rowKey)).status, 200);
    assert.equal((await role(A, U, "selected", round.rowKey)).status, 200);
    const team = get("team", id);
    for (const field of Object.keys(team).filter(
        (k) => !["partitionKey", "rowKey", "etag"].includes(k),
    ))
        assert.ok(
            [
                "name",
                "state",
                "external_key",
                "last_synced",
                "operation_guard",
            ].includes(field) || field.startsWith("ext_"),
            field,
        );
    assert.equal(team.operation_guard, 0);
    mirrored();
});

test("migration removes team foreign references, converts legacy admins and keeps guard expiry on the team", async () => {
    seed();
    get("team", T).operation_until = 0;
    relation(T, U, { role: "is_member" });
    await call("sync", A);
    const team = get("team", T);
    assert.equal(team.club_id, undefined);
    assert.equal(team.requested_by, undefined);
    assert.equal(team.operation_until, undefined);
    assert.equal(team.operation_guard, 0);
    assert.ok(team.external_key);
    assert.equal(get(T, A).is_admin, true);
    assert.equal(get(A, T).is_admin, true);
    assert.equal(get(T, A).role, undefined);
    assert.equal(get(T, U).role, "is_member");
    assert.ok(get(T, C));
    assert.ok(get(C, T));
    team.operation_guard = Date.now() + 60000;
    assert.equal((await call("sync", A)).status, 409);
    team.operation_guard = 0;
    assert.equal((await call("sync", A)).status, 200);
    mirrored();
});

test("club/admin relations remain authoritative over stale club_id and requested_by attributes", async () => {
    seed("pending");
    const other = "club_other";
    entity("club", other, { name: "Other" });
    relation(other, OUT, { is_admin: true });
    rows.delete(key(T, C));
    rows.delete(key(C, T));
    relation(T, other);
    relation(T, B, { is_admin: true }); // authoritative prospective admin; stale requested_by remains A
    assert.equal((await call("activate", CLUBADMIN)).status, 403);
    assert.equal((await call("activate", OUT)).status, 200);
    assert.equal(get(T, B).is_admin, true);
    assert.equal(get(T, A).is_admin, undefined);
    assert.equal(get("team", T).requested_by, undefined);
    assert.equal(get("team", T).club_id, undefined);
    assert.ok(get(T, other));
    assert.equal(get(T, C), undefined);
    assert.equal((await call("sync", A)).status, 403);
    assert.equal((await call("sync", B)).status, 200);
    mirrored();
});

test("an explicit admin revocation cannot be overridden by legacy role or requester attributes", async () => {
    seed("pending");
    relation(T, A, { is_admin: false, role: "is_admin" });
    assert.equal((await call("activate", CLUBADMIN)).status, 409);
    assert.equal(get("team", T).state, "pending");
    assert.equal(get(T, A).is_admin, false);
    get("team", T).state = "active";
    assert.equal((await call("sync", A)).status, 403);
});
