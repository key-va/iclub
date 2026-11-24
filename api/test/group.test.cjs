process.env.RESOURCE_GROUP_PREFIX = "test";
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const original = Module._load;
const rows = new Map(),
    blobs = new Map(),
    pushes = [];
let exportsCount, rejectSignature, failPush, failWrite, failPublish;
const key = (pk, rk) => `${pk}|${rk}`;
const seed = (pk, rk, attrs = {}) =>
    rows.set(key(pk, rk), {
        partitionKey: pk,
        rowKey: rk,
        etag: "v1",
        ...attrs,
    });
const get = (pk, rk) => rows.get(key(pk, rk));
const relation = (a, b, attrs = {}) => {
    seed(a, b, attrs);
    seed(b, a, attrs);
};
class TableClient {
    async getEntity(pk, rk) {
        const row = get(pk, rk);
        if (!row) throw { statusCode: 404 };
        return { ...row };
    }
    async upsertEntity(row) {
        if (key(row.partitionKey, row.rowKey) === failWrite) {
            failWrite = undefined;
            throw new Error("Table write interrupted");
        }
        rows.set(key(row.partitionKey, row.rowKey), { ...row, etag: "v1" });
    }
    async updateEntity(row, mode, options) {
        assert.ok(["Merge", "Replace"].includes(mode));
        const old = get(row.partitionKey, row.rowKey);
        if (!old) throw { statusCode: 404 };
        if (options?.etag && options.etag !== old.etag) throw { statusCode: 412 };
        if (mode === "Replace") rows.delete(key(row.partitionKey, row.rowKey));
        rows.set(key(row.partitionKey, row.rowKey), Object.assign(mode === "Merge" ? old : {}, row, { etag: `v${Number(old.etag.slice(1)) + 1}` }));
    }
    async submitTransaction(updates) {
        for (const [action, row] of updates) {
            assert.equal(action, "upsert");
            await this.upsertEntity(row);
        }
    }
    async deleteEntity(pk, rk) {
        if (!rows.delete(key(pk, rk))) throw { statusCode: 404 };
    }
    async *listEntities({ queryOptions: { filter } }) {
        const fields = [...filter.text.matchAll(/(PartitionKey|url) eq /g)].map(
            (m) => (m[1] === "PartitionKey" ? "partitionKey" : m[1]),
        );
        for (const row of rows.values())
            if (fields.every((field, i) => row[field] === filter.values[i]))
                yield { ...row };
    }
}
class BlobServiceClient {
    getContainerClient() {
        return {
            getBlockBlobClient: (name) => ({
                downloadToBuffer: async () => {
                    if (!blobs.has(name)) throw { statusCode: 404 };
                    return blobs.get(name);
                },
                uploadData: async (bytes) => blobs.set(name, bytes),
            }),
        };
    }
}
const routes = new Map();
Module._load = function (id) {
    if (id === "@azure/functions") return { app: { http(name, options) {
        assert.equal(routes.has(options.route), false, `Duplicate route: ${options.route}`);
        routes.set(options.route, { name, ...options });
    } } };
    if (id === "@azure/identity") return { DefaultAzureCredential: class {} };
    if (id === "@azure/data-tables")
        return {
            TableClient,
            odata: (strings, ...values) => ({ text: strings.join(""), values }),
        };
    if (id === "@azure/storage-blob") return { BlobServiceClient };
    if (id.endsWith("/doSignatureVerification"))
        return {
            doSignatureVerification: async () => {
                if (rejectSignature) throw Error("Invalid signature");
            },
        };
    if (id.endsWith("/doGuidsToPublic"))
        return { doGuidsToPublic: async () => {
            if (failPublish) {
                failPublish = false;
                throw new Error("Publishing interrupted");
            }
            exportsCount++;
        } };
    if (id.endsWith("/doSendPush"))
        return {
            doSendPush: async (input) => {
                if (failPush) throw Error("Push failed");
                pushes.push(input);
                return true;
            },
        };
    return original.apply(this, arguments);
};
const groupActions = ["create", "activate", "join", "accept", "update", "leave"];
const compActions = ["create", "activate", "join", "accept", "leave", "seed", "unseed", "draw", "score", "correct", "forfeit"];
for (const [type, actions] of [["group", groupActions], ["comp", compActions]]) {
    for (const action of actions) require(`../dist/src/functions/${type}${action[0].toUpperCase()}${action.slice(1)}`);
}
const { messageCreate } = require("../dist/src/functions/messageCreate");
const context = { log() {}, warn() {} };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
function request(
    caller,
    data = {},
    id = "group_g",
    action = "",
    origin = "https://club.example",
    type = "group",
) {
    return {
        params: action === "create" ? {} : { [`${type}_id`]: id },
        url: `https://api.example/api/${type}/${action === "create" ? action : `${id}/${action}`}`,
        headers: new Headers({ origin }),
        json: async () => ({
            caller_id: caller,
            device_id: "device_test",
            signature: "test",
            data,
        }),
    };
}
const routeFor = (type, action) => action === "create"
    ? `${type}/create`
    : `${type}/{${type}_id}/${action}`;
const invoke = (type, action, caller, data, id, origin) => {
    const registration = routes.get(routeFor(type, action));
    return registration
        ? registration.handler(request(caller, data, id, action, origin, type), context)
        : { status: 404 };
};
const call = (action, caller, data, id, origin) => invoke("group", action, caller, data, id, origin);
function mirrors(a, b) {
    const clean = (row) => {
        const { partitionKey, rowKey, etag, ...attrs } = row;
        return attrs;
    };
    assert.deepEqual(clean(get(a, b)), clean(get(b, a)));
}
beforeEach(() => {
    rows.clear();
    blobs.clear();
    pushes.length = 0;
    exportsCount = 0;
    rejectSignature = false;
    failPush = false;
    failWrite = undefined;
    failPublish = false;
    seed("club", "club_home", { name: "Club", url: "club.example" });
    seed("club", "club_other", { url: "other.example" });
    for (const id of [
        "creator",
        "clubadmin",
        "member",
        "applicant",
        "visitor",
        "otheradmin",
    ])
        seed("user", `user_${id}`, {
            name: id === "creator" ? "Alice Player" : id,
        });
    relation("club_home", "user_clubadmin", { is_admin: true });
    relation("club_other", "user_otheradmin", { is_admin: true });
    blobs.set("club_home.jpg", jpeg);
    seed("group", "group_g", { name: "Weekend Social", state: "active" });
    relation("group_g", "club_home");
    relation("group_g", "user_creator", {
        is_admin: true,
        is_participant: true,
    });
    relation("group_g", "user_member", { is_participant: true });
});
after(() => (Module._load = original));
test("creation uses origin club, its icon and mirrored creator admin/participant flags, and requests approval by name", async () => {
    const r = await call("create", "user_creator", {
        name: "  Social Tennis  ",
    });
    assert.equal(r.status, 201);
    const id = r.jsonBody.subject;
    assert.match(id, /^group_/);
    assert.equal(get("group", id).name, "Social Tennis");
    assert.equal(get("group", id).state, "pending");
    assert.deepEqual(Object.keys(get("group", id)).sort(), [
        "etag",
        "name",
        "partitionKey",
        "rowKey",
        "state",
    ]);
    assert.equal(get(id, "user_creator").is_admin, true);
    assert.equal(get(id, "user_creator").is_participant, true);
    mirrors(id, "user_creator");
    mirrors(id, "club_home");
    assert.deepEqual(blobs.get(`${id}.jpg`), jpeg);
    assert.equal(exportsCount, 1);
    assert.equal(
        pushes[0].content,
        "Alice Player has requested to create this group",
    );
    assert.deepEqual(pushes[0].userIds, ["user_clubadmin"]);
    assert.equal(pushes[0].path, `group/${id}`);
    assert.equal((await call("join", "user_applicant", {}, id)).status, 409);
    assert.equal((await call("activate", "user_creator", {}, id)).status, 403);
    assert.equal(
        (await call("activate", "user_otheradmin", {}, id)).status,
        403,
    );
    assert.equal(
        (await call("activate", "user_clubadmin", {}, id)).status,
        200,
    );
    assert.equal(get("group", id).state, "active");
    assert.equal(get(id, "user_creator").is_participant, true);
    assert.equal(
        pushes.at(-1).content,
        "Your group has been accepted and is now live",
    );
    assert.equal(
        (await call("activate", "user_clubadmin", {}, id)).status,
        409,
    );
});
test("membership requires an active group, then a request and group-admin acceptance; unrelated club admins cannot accept", async () => {
    const joined = await call("join", "user_applicant");
    assert.equal(joined.status, 200);
    assert.equal(joined.jsonBody.subject, "group_g");
    assert.equal(get("group_g", "user_applicant").state, "pending");
    assert.equal(get("group_g", "user_applicant").is_participant, false);
    mirrors("group_g", "user_applicant");
    assert.equal(pushes[0].content, "applicant has requested to join");
    assert.deepEqual(pushes[0].userIds, ["user_creator"]);
    assert.equal((await call("join", "user_applicant")).status, 409);
    assert.equal((await call("join", "user_member")).status, 409);
    for (const caller of [
        "user_member",
        "user_clubadmin",
        "user_otheradmin",
        "user_visitor",
    ])
        assert.equal(
            (await call("accept", caller, { user_id: "user_applicant" }))
                .status,
            403,
        );
    assert.equal(
        (await call("accept", "user_creator", { user_id: "user_visitor" }))
            .status,
        409,
    );
    assert.equal(
        (await call("accept", "user_creator", { user_id: "user_applicant" }))
            .status,
        200,
    );
    assert.equal(get("group_g", "user_applicant").is_participant, true);
    assert.equal(get("group_g", "user_applicant").state, undefined);
    mirrors("group_g", "user_applicant");
    assert.deepEqual(pushes.at(-1).userIds, ["user_applicant"]);
    assert.equal(
        (await call("accept", "user_creator", { user_id: "user_applicant" }))
            .status,
        409,
    );
});
test("admin can update only name/image, retaining approval state and membership; submitted images override club branding", async () => {
    const custom = Buffer.from([0xff, 0xd8, 0xff, 0x02]);
    assert.equal(
        (
            await call("create", "user_creator", {
                name: "Custom",
                image: custom.toString("base64"),
            })
        ).status,
        201,
    );
    const id = pushes.at(-1).path.split("/")[1];
    assert.deepEqual(blobs.get(`${id}.jpg`), custom);
    assert.equal(
        (await call("update", "user_member", { name: "Hijacked" })).status,
        403,
    );
    assert.equal(
        (
            await call("update", "user_creator", {
                name: " Renamed ",
                image: custom.toString("base64"),
            })
        ).status,
        200,
    );
    assert.equal(get("group", "group_g").name, "Renamed");
    assert.equal(get("group", "group_g").state, "active");
    assert.deepEqual(blobs.get("group_g.jpg"), custom);
    mirrors("group_g", "user_creator");
    for (const data of [
        { name: " " },
        { state: "active" },
        { club_id: "club_other" },
        { is_admin: true },
        { image: "bad" },
        {},
    ])
        assert.equal((await call("update", "user_creator", data)).status, 400);
});
test("creation rejects unknown origins, forged club attributes, empty names and invalid images without publishing", async () => {
    for (const data of [
        { name: "" },
        { name: " " },
        { name: "Test", image: "bad" },
        { name: "Test", club_id: "club_other" },
    ])
        assert.equal((await call("create", "user_creator", data)).status, 400);
    assert.equal(
        (
            await call(
                "create",
                "user_creator",
                { name: "Test" },
                undefined,
                "https://unknown.example",
            )
        ).status,
        400,
    );
    assert.equal(exportsCount, 0);
    assert.equal(pushes.length, 0);
    rejectSignature = true;
    assert.equal(
        (await call("create", "user_creator", { name: "Test" })).status,
        401,
    );
    rejectSignature = false;
    assert.equal(
        (await call("create", "user_missing", { name: "Test" })).status,
        403,
    );
    assert.equal(
        (await call("join", "user_member", {}, "group_missing")).status,
        404,
    );
});
test("notification failure does not undo group creation or membership changes", async () => {
    failPush = true;
    assert.equal(
        (await call("create", "user_creator", { name: "Test" })).status,
        201,
    );
    assert.equal((await call("join", "user_applicant")).status, 200);
    assert.equal(
        (await call("accept", "user_creator", { user_id: "user_applicant" }))
            .status,
        200,
    );
    assert.equal(get("group_g", "user_applicant").is_participant, true);
});
test("any signed-in user can message; notifications include every participant, including sender, but exclude applicants and admin-only relations", async () => {
    relation("group_g", "user_applicant", {
        state: "pending",
        is_participant: false,
    });
    relation("group_g", "user_otheradmin", { is_admin: true });
    for (const caller of ["user_visitor", "user_creator"]) {
        const r = await messageCreate(
            request(caller, { group_id: "group_g", text: " Hello team 👋 " }),
            context,
        );
        assert.equal(r.status, 201);
        const id = r.jsonBody.data.message_id;
        assert.equal(get("message", id).name, "Hello team 👋");
        mirrors(id, "group_g");
        mirrors(id, caller);
        assert.equal(get(id, caller).role, "sender");
        const push = pushes.at(-1);
        assert.deepEqual(push.userIds.sort(), ["user_creator", "user_member"]);
        assert.equal(push.exceptUserId, undefined);
        assert.equal(push.path, "group/group_g");
        assert.equal(
            push.content,
            `${get("user", caller).name}: Hello team 👋`,
        );
    }
    for (const data of [
        { group_id: "group_g", round_id: "round_r", text: "Hi" },
        { group_id: "group_g", match_id: "match_m", text: "Hi" },
        { group_id: 12, text: "Hi" },
        { group_id: "group_g", text: "" },
        { group_id: "group_g", text: "x".repeat(501) },
    ])
        assert.equal(
            (await messageCreate(request("user_visitor", data), context))
                .status,
            400,
        );
    assert.equal(
        (
            await messageCreate(
                request("user_missing", { group_id: "group_g", text: "Hi" }),
                context,
            )
        ).status,
        403,
    );
    assert.equal(
        (
            await messageCreate(
                request("user_visitor", {
                    group_id: "group_missing",
                    text: "Hi",
                }),
                context,
            )
        ).status,
        404,
    );
    rejectSignature = true;
    assert.equal(
        (
            await messageCreate(
                request("user_visitor", { group_id: "group_g", text: "Hi" }),
                context,
            )
        ).status,
        401,
    );
});

test("persisted group messages survive notification failure, and malformed group payloads cannot write", async () => {
    failPush = true;
    const r = await messageCreate(
        request("user_visitor", {
            group_id: "group_g",
            text: "Saved despite delivery failure",
        }),
        context,
    );
    assert.equal(r.status, 201);
    assert.equal(
        get("message", r.jsonBody.data.message_id).name,
        "Saved despite delivery failure",
    );
    mirrors(r.jsonBody.data.message_id, "group_g");
    const count = exportsCount;
    for (const data of [null, [], "bad"])
        assert.equal((await call("create", "user_creator", data)).status, 400);
    assert.equal(exportsCount, count);
});

const { elimBracketId, elimDraw } = require("../dist/src/services/elimDraw");
const elimCall = (id, action, caller, data) => invoke("comp", action, caller, data, id);
const elimAdmin = "user_creator";
const clubAdmin = "user_clubadmin";
async function openElim(format = "singles", match_format, comp_system = "elimination") {
    const create = await elimCall(undefined, "create", elimAdmin, {
        name: "Club knockout", comp_system, ...(format === "singles" ? {} : { format }), match_format,
    });
    assert.equal(create.status, 201);
    const id = create.jsonBody.subject;
    assert.equal(get("comp", id).state, "pending");
    assert.equal(get("comp", id).comp_system, comp_system);
    assert.equal(get("comp", id).format, format);
    assert.equal(get("comp", id).match_format, match_format ?? "super_set");
    assert.match(id, /^comp_/);
    assert.equal((await elimCall(id, "activate", elimAdmin)).status, 403);
    assert.equal((await elimCall(id, "activate", clubAdmin)).status, 200);
    return id;
}

async function enterElim(id, entrants) {
    for (const userId of entrants) {
        assert.equal((await elimCall(id, "join", userId)).status, 200);
        assert.equal((await elimCall(id, "accept", elimAdmin, { user_id: userId })).status, 200);
        mirrors(id, userId);
    }
}

function slot(matchId, number) {
    return [...rows.values()].find(row => row.partitionKey === matchId && row.slot === number)?.rowKey ?? "";
}
function winner(matchId) {
    return [...rows.values()].find(row =>
        row.partitionKey === matchId && ["winner", "bye"].includes(row.result)
    )?.rowKey;
}

function scores(matchId, a, b) {
    return {
        match_id: matchId,
        first_id: slot(matchId, 1),
        second_id: slot(matchId, 2),
        first_score: a,
        second_score: b,
    };
}

test("Elim seeds follow tap order and a failed draw reuses match IDs and ranked byes", async () => {
    const id = await openElim();
    const entrants = ["user_member", "user_applicant", "user_visitor", "user_otheradmin", clubAdmin];
    await enterElim(id, entrants);
    assert.equal((await elimCall(id, "seed", entrants[0], { user_id: entrants[1] })).status, 403);
    for (const user_id of entrants.slice(0, 3))
        assert.equal((await elimCall(id, "seed", elimAdmin, { user_id })).status, 200);
    await elimCall(id, "unseed", elimAdmin, { user_id: entrants[0] });
    await elimCall(id, "seed", elimAdmin, { user_id: entrants[0] });
    assert.deepEqual(entrants.slice(0, 3).map(userId => get(id, userId).seed), [3, 1, 2]);
    for (const userId of entrants) mirrors(id, userId);
    assert.equal((await elimCall(id, "join", elimAdmin)).status, 200);

    const firstId = elimBracketId("match", id, 1, 1);
    const secondId = elimBracketId("match", id, 1, 2);
    failWrite = key("match", secondId);
    await assert.rejects(elimCall(id, "draw", elimAdmin), /Table write interrupted/);
    assert.equal(get("comp", id).state, "drawing");
    assert.equal((await elimCall(id, "accept", elimAdmin, { user_id: elimAdmin })).status, 409);
    const saved = { ...get("match", firstId) };
    assert.equal((await elimCall(id, "draw", elimAdmin)).status, 200);
    assert.deepEqual(get("match", firstId), saved);
    assert.equal(get("comp", id).state, "active");
    assert.equal(get(id, elimAdmin).state, "closed");
    const matches = [...rows.values()].filter(row => row.partitionKey === "match");
    assert.equal(matches.length, 7);
    assert.deepEqual(matches.filter(row => row.state === "bye").map(row => winner(row.rowKey)).sort(), entrants.slice(0, 3).sort());
    for (const match of matches) {
        mirrors(id, match.rowKey);
        assert.deepEqual(Object.keys(match).sort(), ["etag", "name", "partitionKey", "rowKey", "state"]);
    }
    const round = elimBracketId("round", id, 1);
    assert.equal(get("round", round).bracket_round, undefined);
    assert.equal(get(id, round).bracket_round, 1);
    assert.equal(get(round, firstId).bracket_match, 1);
    mirrors(id, round);
    mirrors(round, firstId);
    assert.equal(get("comp", id).rounds, undefined);
    assert.equal(get("comp", id).draw_version, undefined);
    assert.equal((await elimCall(id, "draw", elimAdmin)).status, 200);
});

test("Elim score repair advances winners, notifies the right players and guards corrections", async () => {
    const id = await openElim();
    await enterElim(id, ["user_member", "user_applicant", "user_visitor", "user_otheradmin"]);
    await elimCall(id, "draw", elimAdmin);
    const firstMatch = elimBracketId("match", id, 1, 1);
    const secondMatch = elimBracketId("match", id, 1, 2);
    const final = elimBracketId("match", id, 2, 1);
    const firstScore = scores(firstMatch, 8, 4);
    assert.equal((await elimCall(id, "score", elimAdmin, scores(final, 8, 4))).status, 409);

    // Interrupt propagation after the authoritative score has been persisted.
    failWrite = key(final, firstScore.first_id);
    await assert.rejects(elimCall(id, "score", firstScore.first_id, firstScore), /Table write interrupted/);
    assert.equal(winner(firstMatch), firstScore.first_id);
    assert.equal(JSON.parse(get("comp", id).pending_result).matchId, firstMatch);
    assert.equal((await elimCall(id, "score", firstScore.first_id, firstScore)).status, 200);
    assert.equal(get("comp", id).pending_result, undefined);
    assert.equal(pushes.at(-1).exceptUserId, firstScore.first_id);
    assert.deepEqual(pushes.at(-1).userIds, [firstScore.first_id, firstScore.second_id]);
    assert.equal(slot(final, 1), firstScore.first_id);

    const otherScore = scores(secondMatch, 8, 1);
    assert.equal((await elimCall(id, "score", elimAdmin, otherScore)).status, 200);
    assert.equal(pushes.at(-1).exceptUserId, elimAdmin);
    assert.deepEqual(pushes.at(-1).userIds, [otherScore.first_id, otherScore.second_id]);
    const staleFinal = scores(final, 8, 4);
    const correction = scores(firstMatch, 2, 8);
    assert.equal((await elimCall(id, "correct", firstScore.first_id, correction)).status, 403);
    assert.equal((await elimCall(id, "correct", elimAdmin, correction)).status, 200);
    assert.equal(slot(final, 1), firstScore.second_id);
    assert.equal(get(final, firstScore.first_id), undefined);
    assert.equal(get(firstScore.first_id, final), undefined);
    mirrors(final, firstScore.second_id);
    assert.equal((await elimCall(id, "score", elimAdmin, staleFinal)).status, 409);

    const finalist = slot(final, 1);
    relation(id, finalist, { is_admin: true, is_participant: true });
    assert.equal((await elimCall(id, "score", finalist, scores(final, 8, 5))).status, 200);
    assert.equal(pushes.at(-1).exceptUserId, finalist);
    assert.deepEqual(pushes.at(-1).userIds.filter(user => user !== pushes.at(-1).exceptUserId), [slot(final, 2)]);
    assert.equal(winner(final), firstScore.second_id);
    assert.equal((await elimCall(id, "correct", elimAdmin, firstScore)).status, 409);
    assert.equal((await elimCall(id, "correct", elimAdmin, scores(final, 5, 8))).status, 200);
    assert.equal(winner(final), otherScore.first_id);
});

test("Elim shuffle is stable across roster order and across bracket sizes", () => {
    for (const count of [2, 5, 8, 9, 16, 19]) {
        const entrants = Array.from({ length: count }, (_, i) => ({
            id: `user_${i + 1}`, seed: i < Math.min(8, count) ? i + 1 : 0,
        }));
        const id = "comp_2026-11-19_12-00-00_0123456789ab";
        const result = elimDraw(id, entrants);
        assert.deepEqual(result, elimDraw(id, [...entrants].reverse()));
        assert.equal(result.slots.filter(Boolean).length, count);
        const byeRecipients = [];
        for (let i = 0; i < result.slots.length; i += 2) {
            const [a, b] = result.slots.slice(i, i + 2);
            assert.ok(a || b);
            if (!a || !b) byeRecipients.push(a || b);
        }
        const seeded = entrants.filter(player => player.seed > 0);
        assert.ok(seeded.slice(0, byeRecipients.length).every(player => byeRecipients.includes(player.id)));
    }
});

test("Concurrent Elim results can be retried and fill both slots of the final", async () => {
    const id = await openElim();
    await enterElim(id, ["user_member", "user_applicant", "user_visitor", "user_otheradmin"]);
    await elimCall(id, "draw", elimAdmin);
    const submissions = [1, 2].map(index => scores(elimBracketId("match", id, 1, index), 8, 2));
    const results = await Promise.all(submissions.map(data => elimCall(id, "score", elimAdmin, data)));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const retry = submissions[results.findIndex(result => result.status === 409)];
    assert.equal((await elimCall(id, "score", elimAdmin, retry)).status, 200);
    const final = get("match", elimBracketId("match", id, 2, 1));
    assert.deepEqual([slot(final.rowKey, 1), slot(final.rowKey, 2)], submissions.map(data => data.first_id));
    assert.equal(final.state, "active");
});

test("Competition creation requires a supported type", async () => {
    for (const comp_system of [undefined, "league"]) {
        const response = await elimCall(undefined, "create", elimAdmin, { name: "Club event", comp_system });
        assert.equal(response.status, 400);
    }
    for (const settings of [{ format: "triples" }, { match_format: "unknown" }]) {
        const response = await elimCall(undefined, "create", elimAdmin, {
            name: "Club event", comp_system: "elimination", ...settings,
        });
        assert.equal(response.status, 400);
    }
    assert.equal([...rows.values()].some(row => row.partitionKey === "comp"), false);
});

test("Competition round names, pending slots and player forfeits follow the draw", async () => {
    const id = await openElim();
    await enterElim(id, ["user_member", "user_applicant", "user_visitor", "user_otheradmin"]);
    await elimCall(id, "draw", elimAdmin);
    assert.equal(get("round", elimBracketId("round", id, 1)).name, "Club knockout R1");
    assert.equal(get("round", elimBracketId("round", id, 2)).name, "Club knockout Final");

    const firstMatch = elimBracketId("match", id, 1, 1);
    const secondMatch = elimBracketId("match", id, 1, 2);
    const final = elimBracketId("match", id, 2, 1);
    const first = scores(firstMatch, 8, 1);
    for (const player of [first.first_id, first.second_id]) {
        assert.equal(get(firstMatch, player).role, "competitor");
        assert.equal(get(player, firstMatch).role, "competitor");
    }
    const second = scores(secondMatch, 8, 1);
    seed("user", first.first_id, { name: "Taylor Smith" });
    seed("user", first.second_id, { name: "Jordan Jones" });
    seed("user", second.first_id, { name: "Alex Green" });
    assert.equal(get("match", final).name, "Final Pending");

    const forfeit = { ...scores(firstMatch, 0, 0), winner_id: first.first_id };
    assert.equal((await elimCall(id, "forfeit", second.first_id, forfeit)).status, 403);
    assert.equal((await elimCall(id, "forfeit", first.first_id, forfeit)).status, 200);
    assert.equal(get("match", firstMatch).name, "Taylor vs Jordan");
    assert.equal(get(first.first_id, firstMatch).result, "forfeiter");
    assert.equal(get("match", final).name, "Final Pending");

    assert.equal((await elimCall(id, "score", second.first_id, scores(secondMatch, 8, 1))).status, 200);
    assert.equal(get("match", final).name, "Jordan vs Alex");

    const finalScore = scores(final, 0, 0);
    assert.equal((await elimCall(id, "forfeit", elimAdmin, finalScore)).status, 403);
    assert.equal((await elimCall(id, "walkover", elimAdmin, finalScore)).status, 404);
    relation(id, first.second_id, { is_admin: true, is_participant: true });
    assert.equal((await elimCall(id, "forfeit", first.second_id, {
        ...finalScore, winner_id: first.second_id,
    })).status, 200);
    assert.equal(winner(final), second.first_id);
    assert.equal(get(first.second_id, final).result, "forfeiter");
});

test("An interrupted legacy competition result migrates and resumes without losing its score", async () => {
    const id = await openElim();
    const first = "user_member";
    const second = "user_applicant";
    await enterElim(id, [first, second]);
    const roundId = elimBracketId("round", id, 1);
    const matchId = elimBracketId("match", id, 1, 1);
    const comp = get("comp", id);
    delete comp.comp_system;
    Object.assign(comp, {
        competition_type: "elimination", state: "active", rounds: 1,
        draw_version: 1, pending_match_id: matchId,
    });
    seed("round", roundId, { name: "Old Final", bracket_round: 1 });
    seed("match", matchId, {
        name: "Old match", state: "active", label: "Final", bracket_round: 1,
        bracket_match: 1, first_id: first, second_id: second, draw_ready: true,
        winner_id: first, first_score: 8, second_score: 3,
        result_pending: true, result_action: "score", result_exclude_user: first,
    });
    relation(id, roundId);
    relation(id, matchId);
    relation(roundId, matchId);
    relation(matchId, first, { role: "challenger" });
    relation(matchId, second, { role: "defender" });
    const result = { match_id: matchId, first_id: first, second_id: second, first_score: 8, second_score: 3 };

    failWrite = key("match", matchId);
    await assert.rejects(elimCall(id, "score", first, result), /Table write interrupted/);
    assert.equal(get("comp", id).competition_type, "elimination");
    assert.equal((await elimCall(id, "score", first, result)).status, 200);
    assert.equal(get("comp", id).state, "complete");
    assert.equal(get("comp", id).comp_system, "elimination");
    assert.equal(get("comp", id).competition_type, undefined);
    assert.equal(get("comp", id).pending_result, undefined);
    assert.equal(get("comp", id).operation_guard, undefined);
    assert.equal(get("round", roundId).bracket_round, undefined);
    assert.equal(get(id, roundId).bracket_round, 1);
    assert.equal(get(roundId, matchId).bracket_match, 1);
    assert.equal(get("match", matchId).first_id, undefined);
    assert.equal(get("match", matchId).winner_id, undefined);
    assert.equal(get(matchId, first).score, 8);
    assert.equal(get(matchId, second).score, 3);
    assert.equal(winner(matchId), first);
    mirrors(matchId, first);
    mirrors(matchId, second);
});

test("Groups and competitions register one named POST endpoint per action", () => {
    for (const [type, actions] of [["group", groupActions], ["comp", compActions]]) {
        const registered = [...routes.keys()].filter(route => route.startsWith(`${type}/`));
        assert.deepEqual(registered.sort(), actions.map(action => routeFor(type, action)).sort());
        for (const action of actions) {
            const endpoint = routes.get(routeFor(type, action));
            assert.equal(endpoint.name, `${type}${action[0].toUpperCase()}${action.slice(1)}`);
            assert.deepEqual(endpoint.methods, ["POST"]);
        }
    }
});

test("Drawn comp matches notify both players after publication, including on recovery", async () => {
    const id = await openElim();
    await enterElim(id, ["user_member", "user_applicant", "user_visitor"]);
    const drawnNotices = () => pushes.filter(push => push.content === "Get ready, your next comp match is drawn");
    const assertMatchNotice = (notice, matchId) => {
        assert.equal(notice.path, `match/${matchId}`);
        assert.equal(notice.heading, get("match", matchId).name);
        assert.equal(notice.exceptUserId, undefined);
        assert.deepEqual(notice.userIds.sort(), [slot(matchId, 1), slot(matchId, 2)].sort());
    };

    failPublish = true;
    await assert.rejects(elimCall(id, "draw", elimAdmin), /Publishing interrupted/);
    assert.equal(drawnNotices().length, 0);
    const firstRound = [1, 2].map(position => elimBracketId("match", id, 1, position));
    const matchId = firstRound.find(m => get("match", m).state === "active");
    assert.ok(matchId);
    assert.equal((await elimCall(id, "draw", elimAdmin)).status, 200);
    assert.equal(drawnNotices().length, 1);
    assertMatchNotice(drawnNotices()[0], matchId);
    assert.equal((await elimCall(id, "draw", elimAdmin)).status, 200);
    assert.equal(drawnNotices().length, 1);

    const result = scores(matchId, 8, 3);
    const final = elimBracketId("match", id, 2, 1);
    failPublish = true;
    await assert.rejects(elimCall(id, "score", result.first_id, result), /Publishing interrupted/);
    assert.equal(get("match", final).state, "active");
    assert.equal(drawnNotices().length, 1);
    assert.equal((await elimCall(id, "score", result.first_id, result)).status, 200);
    assert.equal(drawnNotices().length, 2);
    assertMatchNotice(drawnNotices()[1], final);
    assert.equal((await elimCall(id, "correct", elimAdmin, scores(matchId, 8, 4))).status, 200);
    assert.equal(drawnNotices().length, 2);
});

test("Doubles comp pairs enter, seed, withdraw, advance and forfeit as a side", async () => {
    seed("user", "user_extra", { name: "Extra Player" });
    const id = await openElim("doubles");
    const teams = [
        ["user_member", "user_applicant"], ["user_visitor", "user_otheradmin"],
        [clubAdmin, "user_extra"],
    ];
    const accept = (user_ids, caller = elimAdmin) => elimCall(id, "accept", caller, { user_ids });
    const pairOf = (users) => [...rows.values()]
        .find(row => row.partitionKey === id && row.rowKey.startsWith("pair_") &&
            row.is_participant && users.every(user => get(row.rowKey, user)?.role === "member")).rowKey;

    for (const user of teams.flat())
        assert.equal((await elimCall(id, "join", user)).status, 200);
    assert.equal((await accept(teams[0], clubAdmin)).status, 403);
    assert.equal((await accept([teams[0][0], teams[0][0]])).status, 400);
    for (const team of teams) {
        assert.equal((await accept(team)).status, 200);
        const pair = pairOf(team);
        mirrors(id, pair);
        for (const user of team) {
            mirrors(pair, user);
            mirrors(id, user);
        }
        assert.deepEqual(pushes.at(-1).userIds, team);
        assert.equal((await elimCall(id, "seed", elimAdmin, { pair_id: pair })).status, 200);
    }
    assert.equal((await accept([teams[0][0], teams[1][1]])).status, 409);
    const [seeded, second, third] = teams.map(pairOf);
    assert.equal((await elimCall(id, "leave", teams[0][0])).status, 200);
    assert.equal(get(id, seeded).state, "left");
    assert.equal(get(id, teams[0][0]).state, "left");
    assert.equal(get(id, teams[0][1]).state, "pending");
    assert.equal(get(id, second).seed, 1);
    assert.equal(get(id, third).seed, 2);
    assert.equal((await elimCall(id, "join", teams[0][0])).status, 200);
    assert.equal((await accept(teams[0])).status, 200);
    assert.equal(pairOf(teams[0]), seeded);
    assert.equal((await accept(teams[0])).status, 200);
    assert.equal((await elimCall(id, "draw", elimAdmin)).status, 200);
    assert.equal((await elimCall(id, "leave", teams[0][0])).status, 409);

    const rounds = [1, 2].map(position => elimBracketId("match", id, 1, position));
    const bye = rounds.find(match => get("match", match).state === "bye");
    assert.equal(winner(bye), second);
    const semi = rounds.find(match => get("match", match).state === "active");
    const final = elimBracketId("match", id, 2, 1);
    const semiScore = scores(semi, 8, 2);
    const usersOf = (pair) => teams.find(team => pairOf(team) === pair);
    const firstUsers = usersOf(semiScore.first_id);
    const secondUsers = usersOf(semiScore.second_id);
    const matchUsers = [...firstUsers, ...secondUsers].sort();
    assert.deepEqual(pushes.at(-1).userIds.sort(), matchUsers);
    assert.match(get("match", semi).name, / and .* vs .* and /);
    assert.equal((await elimCall(id, "forfeit", elimAdmin, semiScore)).status, 403);
    assert.equal((await elimCall(id, "score", firstUsers[1], semiScore)).status, 200);
    assert.equal(pushes.at(-1).exceptUserId, firstUsers[1]);
    assert.deepEqual(pushes.at(-1).userIds.sort(), matchUsers);
    assert.equal(get(semi, firstUsers[1]).result, "winner");
    assert.equal(get(semi, secondUsers[1]).result, "loser");
    assert.equal(get(semi, firstUsers[1]).slot, undefined);
    mirrors(semi, firstUsers[1]);

    assert.equal((await elimCall(id, "correct", elimAdmin, scores(semi, 1, 8))).status, 200);
    assert.equal(pushes.at(-1).exceptUserId, elimAdmin);
    assert.equal(get(final, firstUsers[0]), undefined);
    assert.equal(get(firstUsers[0], final), undefined);
    assert.equal(get(final, secondUsers[0]).role, "participant");
    const finalScore = scores(final, 0, 0);
    assert.equal((await elimCall(id, "forfeit", secondUsers[1], finalScore)).status, 200);
    assert.equal(get("comp", id).state, "complete");
    assert.equal(winner(final), second);
    assert.equal(get(final, secondUsers[0]).result, "forfeiter");
    assert.equal((await elimCall(id, "correct", elimAdmin, semiScore)).status, 409);
    mirrors(final, second);
    mirrors(final, secondUsers[0]);
});


test("comp match formats validate set scores and advance the side with more sets", async () => {
    for (const [format, a, b, invalid] of [
        ["best_of_three", [0, 6, 1], [6, 4, 0], 8],
        ["fast_four", [0, 4, 4], [4, 3, 3], 5],
    ]) {
        const id = await openElim("singles", format);
        await enterElim(id, ["user_member", "user_applicant"]);
        assert.equal((await elimCall(id, "draw", elimAdmin)).status, 200);
        const matchId = elimBracketId("match", id, 1, 1);
        const [first, second] = [slot(matchId, 1), slot(matchId, 2)];
        assert.equal((await elimCall(id, "score", first, scores(matchId, [invalid], [0]))).status, 400);
        assert.equal((await elimCall(id, "score", first, scores(matchId, [0, 4], [4, 0]))).status, 400);
        assert.equal((await elimCall(id, "score", first, scores(matchId, a, b))).status, 200);
        assert.equal(get(matchId, first).result, "winner");
        assert.equal(get(matchId, first).score, a.join(","));
        assert.equal(get(matchId, second).score, b.join(","));
        assert.equal((await elimCall(id, "correct", elimAdmin, scores(matchId, b, a))).status, 200);
        assert.equal(get(matchId, second).result, "winner");
        mirrors(matchId, second);
    }
});

test("25 Round Robin entrants play 300 unique matches across 25 rounds and each has one bye", () => {
    const { roundRobinDraw } = require("../dist/src/services/roundRobinDraw");
    const entrants = Array.from({ length: 25 }, (_, i) => `user_${i}`);
    const rounds = roundRobinDraw(entrants);
    assert.equal(rounds.length, 25);
    assert.equal(new Set(rounds.map(round => round.bye)).size, 25);
    assert.deepEqual(roundRobinDraw([...entrants].reverse()), rounds);
    for (const round of rounds) {
        assert.equal(round.matches.length, 12);
        assert.equal(new Set([...round.matches.flat(), round.bye]).size, 25);
    }
    assert.equal(new Set(rounds.flatMap(round => round.matches.map(pair => [...pair].sort().join(":")))).size, 300);
});

test("Round Robin publishes fixtures, opens one round at a time and allows corrections while running", async () => {
    const id = await openElim("singles", "super_set", "round_robin");
    const stock = ["user_member", "user_applicant", "user_visitor", "user_otheradmin"];
    await enterElim(id, stock);
    assert.equal((await elimCall(id, "seed", elimAdmin, { user_id: stock[0] })).status, 409);
    assert.equal((await elimCall(id, "draw", elimAdmin)).status, 200);
    const matches = Array.from({ length: 3 }, (_, i) =>
        [1, 2].map(position => elimBracketId("match", id, i + 1, position)));
    const state = matchId => get("match", matchId).state;
    const scoreMatch = matchId => elimCall(id, "score", slot(matchId, 1), scores(matchId, 8, 3));
    const notices = () => pushes.filter(push => push.content === "Get ready, your next comp match is drawn");
    assert.deepEqual(matches.map(round => round.map(state)), [
        ["active", "active"], ["waiting", "waiting"], ["waiting", "waiting"],
    ]);
    assert.equal(notices().length, 2);
    assert.equal((await scoreMatch(matches[1][0])).status, 409);
    assert.equal((await scoreMatch(matches[0][0])).status, 200);
    assert.equal(state(matches[1][0]), "waiting");
    failPublish = true;
    await assert.rejects(scoreMatch(matches[0][1]), /Publishing interrupted/);
    assert.equal(notices().length, 2);
    assert.equal((await scoreMatch(matches[0][1])).status, 200);
    assert.equal(notices().length, 4);
    assert.equal((await elimCall(id, "correct", elimAdmin, scores(matches[0][0], 3, 8))).status, 200);
    assert.equal(notices().length, 4);
    for (const match of matches.slice(1).flat()) assert.equal((await scoreMatch(match)).status, 200);
    assert.equal(notices().length, 6);
    assert.equal(get("comp", id).state, "complete");
    assert.equal((await elimCall(id, "correct", elimAdmin, scores(matches[0][0], 8, 3))).status, 409);
    assert.equal(get(matches[0][0], slot(matches[0][0], 2)).result, "winner");
});

test("group admins can reject only pending applicants and notify them once", async () => {
    require("../dist/src/functions/groupReject");
    const data = { user_id: "user_applicant" };
    assert.equal((await call("join", data.user_id)).status, 200);
    assert.equal((await call("reject", "user_clubadmin", data)).status, 403);
    assert.equal((await call("reject", "user_creator", { user_id: "user_member" })).status, 409);
    assert.equal((await call("reject", "user_creator", data)).status, 200);
    assert.equal(get("group_g", data.user_id).state, "left");
    mirrors("group_g", data.user_id);
    assert.deepEqual(pushes.at(-1).userIds, [data.user_id]);
    assert.equal(pushes.at(-1).content,
        `your pending request was rejected, please review the ${get("group", "group_g").name} rules or reach out to your club admin`);
    const notified = pushes.length;
    assert.equal((await call("reject", "user_creator", data)).status, 409);
    assert.equal(pushes.length, notified);
    assert.equal((await call("join", data.user_id)).status, 200);
});

test("a club admin can reject a pending comp creation and prevent later approval", async () => {
    require("../dist/src/functions/compRejectCreation");
    const created = await elimCall(undefined, "create", elimAdmin, {
        name: "Club knockout", comp_system: "elimination",
    });
    const id = created.jsonBody.subject;
    assert.equal((await elimCall(id, "reject-creation", elimAdmin)).status, 403);
    assert.equal((await elimCall(id, "reject-creation", "user_otheradmin")).status, 403);
    assert.equal((await elimCall(id, "reject-creation", clubAdmin)).status, 200);
    assert.equal(get("comp", id).state, "rejected");
    assert.deepEqual(pushes.at(-1).userIds, [elimAdmin]);
    assert.equal((await elimCall(id, "activate", clubAdmin)).status, 409);
});

test("rejecting a doubles comp request leaves the other applicant pending", async () => {
    require("../dist/src/functions/compReject");
    const id = await openElim("doubles");
    for (const user of ["user_applicant", "user_visitor"])
        assert.equal((await elimCall(id, "join", user, {})).status, 200);
    const data = { user_id: "user_applicant" };
    assert.equal((await elimCall(id, "reject", clubAdmin, data)).status, 403);
    assert.equal((await elimCall(id, "reject", elimAdmin, data)).status, 200);
    assert.equal(get(id, data.user_id).state, "left");
    mirrors(id, data.user_id);
    assert.equal(get(id, "user_visitor").state, "pending");
    assert.deepEqual(pushes.at(-1).userIds, [data.user_id]);
});
