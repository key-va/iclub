process.env.RESOURCE_GROUP_PREFIX = "test";
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const original = Module._load;
const rows = new Map(),
    blobs = new Map(),
    pushes = [];
let exportsCount, rejectSignature, failPush;
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
        rows.set(key(row.partitionKey, row.rowKey), { ...row, etag: "v1" });
    }
    async updateEntity(row, mode, options) {
        assert.equal(mode, "Merge");
        const old = get(row.partitionKey, row.rowKey);
        if (!old) throw { statusCode: 404 };
        assert.equal(options.etag, old.etag);
        Object.assign(old, row);
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
Module._load = function (id) {
    if (id === "@azure/functions") return { app: { http() {} } };
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
        return { doGuidsToPublic: async () => exportsCount++ };
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
const { groupAction } = require("../dist/src/functions/group");
const { messageCreate } = require("../dist/src/functions/messageCreate");
const context = { log() {}, warn() {} };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
function request(
    caller,
    data = {},
    id = "group_g",
    action = "",
    origin = "https://club.example",
) {
    return {
        params: { group_id: id, action },
        url: `https://api.example/api/group/${id}/${action}`,
        headers: new Headers({ origin }),
        json: async () => ({
            caller_id: caller,
            device_id: "device_test",
            signature: "test",
            data,
        }),
    };
}
const call = (action, caller, data, id, origin) =>
    groupAction(request(caller, data, id, action, origin), context, action);
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
    assert.equal((await call("join", "user_applicant")).status, 200);
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
