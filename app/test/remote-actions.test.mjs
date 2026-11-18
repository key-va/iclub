import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
process.env.VITE_PREFIX = 'iclub-test';
let server, remote, local;
const originalFetch = globalThis.fetch;
before(async () => {
    server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error', optimizeDeps: { noDiscovery: true } });
    remote = await server.ssrLoadModule('/src/lib/stores/remote.ts');
    local = await server.ssrLoadModule('/src/lib/stores/local.ts');
    const { privateKey } = await remote.generateKeyPair();
    local.set_local_data({ caller_id: 'user_admin', device_id: 'device_test', connect_key: privateKey });
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

test('named ladder actions sign the right endpoint and payload, then refresh the graph', async () => {
    const cases = [
        [() => remote.activateLadder('ladder_test'), '/api/ladder/ladder_test/activate', {}],
        [() => remote.joinLadder('ladder_test'), '/api/ladder/ladder_test/join', {}],
        [() => remote.acceptLadderMember('ladder_test', 'user_one'), '/api/ladder/ladder_test/accept', { user_id: 'user_one' }],
        [() => remote.acceptLadderPair('ladder_test', ['user_one', 'user_two']), '/api/ladder/ladder_test/accept', { user_ids: ['user_one', 'user_two'] }],
        [() => remote.createMatch('ladder_test', 'pair_one', 'pair_two'), '/api/match/create',
            { ladder_id: 'ladder_test', challenger_id: 'pair_one', defender_id: 'pair_two' }]
    ];
    for (const [action, path, data] of cases) {
        const requests = [];
        globalThis.fetch = async (url, options) => {
            requests.push({ url, options });
            return options.method === 'POST'
                ? Response.json({ success: true, message: 'saved', subject: 'ladder_test' })
                : Response.json([]);
        };
        const response = await action();
        assert.equal(response.subject, 'ladder_test');
        assert.equal(requests.length, 2);
        assert.equal(new URL(requests[0].url).pathname, path);
        const body = JSON.parse(requests[0].options.body);
        assert.deepEqual(body.data, data);
        assert.equal(body.caller_id, 'user_admin');
        assert.equal(body.device_id, 'device_test');
        assert.ok(body.signature);
        assert.equal(requests[1].options.method, 'GET');
    }
});

test('refresh retry preserves the mutation result and never repeats the POST', async () => {
    let posts = 0, refreshes = 0;
    globalThis.fetch = async (_url, options) => {
        if (options.method === 'POST') {
            posts++;
            return Response.json({ success: true, message: 'accepted', subject: 'ladder_test' });
        }
        refreshes++;
        return refreshes === 1 ? new Response('', { status: 503 }) : Response.json([]);
    };
    let failure;
    await assert.rejects(remote.acceptLadderMember('ladder_test', 'user_one'), error => {
        failure = error;
        return error instanceof remote.ActionRefreshError && /accepted.*could not refresh/.test(error.message);
    });
    assert.equal((await failure.retry()).subject, 'ladder_test');
    assert.equal(posts, 1);
    assert.equal(refreshes, 2);
});

test('rejected mutations do not refresh the graph', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return Response.json({ success: false, message: 'Not allowed' }, { status: 403 });
    };
    await assert.rejects(remote.joinLadder('ladder_test'), /Not allowed/);
    assert.equal(calls, 1);
});
