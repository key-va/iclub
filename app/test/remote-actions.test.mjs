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
    const auth = await server.ssrLoadModule('/src/lib/stores/auth.ts');
    const { privateKey } = await auth.generateKeyPair();
    local.setLocalData({ caller_id: 'user_admin', device_id: 'device_test', connect_key: privateKey });
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

test('named entity actions sign the right endpoint and payload, then refresh the graph', async () => {
    const cases = [
        [() => remote.awayLadder('ladder_test'), '/api/ladder/ladder_test/away', {}],
        [() => remote.returnLadder('ladder_test'), '/api/ladder/ladder_test/return', {}],
        [() => remote.leaveLadder('ladder_test'), '/api/ladder/ladder_test/leave', {}],
        [() => remote.leaveTeam('team_test'), '/api/team/team_test/leave', {}],
        [() => remote.leaveGroup('group_test'), '/api/group/group_test/leave', {}],
        [() => remote.confirmRoundRole('round_test', 'available'), '/api/round/role', { round_id: 'round_test', role: 'available' }],
        [() => remote.createMatchConfirmation('ladder_test', 'user_a', 'user_b'), '/api/match/create', { ladder_id: 'ladder_test', challenger_id: 'user_a', defender_id: 'user_b' }],
        [() => remote.acceptLadderMemberConfirmation('ladder_test','user_a'), '/api/ladder/ladder_test/accept', { user_id: 'user_a' }],
        [() => remote.acceptTeamMemberConfirmation('team_test','user_a'), '/api/team/accept', { team_id: 'team_test', user_id: 'user_a' }],
        [() => remote.createLadder({ name: 'New' }), '/api/ladder/create', { name: 'New' }],
        [() => remote.updateLadder('ladder_test', { name: 'Changed' }), '/api/ladder/ladder_test/update', { name: 'Changed' }],
        [() => remote.deleteLadder('ladder_test'), '/api/ladder/ladder_test/delete', {}],
        [() => remote.createGroup({ name: 'New' }), '/api/group/create', { name: 'New' }],
        [() => remote.updateGroup('group_test', { name: 'Changed' }), '/api/group/group_test/update', { name: 'Changed' }],
        [() => remote.activateGroup('group_test'), '/api/group/group_test/activate', {}],
        [() => remote.joinGroup('group_test'), '/api/group/group_test/join', {}],
        [() => remote.createTeam({ association: 'brta' }), '/api/team/create', { association: 'brta' }],
        [() => remote.activateTeam('team_test'), '/api/team/activate', { team_id: 'team_test' }],
        [() => remote.joinTeam('team_test'), '/api/team/join', { team_id: 'team_test' }],
        [() => remote.syncTeam('team_test'), '/api/team/sync', { team_id: 'team_test' }],
        [() => remote.acceptMatch('match_test'), '/api/match/match_test/accept', {}],
        [() => remote.completeMatch('match_test', { challenger_score: [6], defender_score: [2] }), '/api/match/match_test/complete', { challenger_score: [6], defender_score: [2] }],
        [() => remote.forfeitMatch('match_test'), '/api/match/match_test/forfeit', {}],
        [() => remote.retirePair('pair_test'), '/api/pair/pair_test/retire', {}],
        [() => remote.updateUser('user_one', { name: 'Changed' }), '/api/user/user_one/update', { name: 'Changed' }],
        [() => remote.deleteUser('user_one'), '/api/user/user_one/delete', {}],
        [() => remote.activateLadder('ladder_test'), '/api/ladder/ladder_test/activate', {}],
        [() => remote.joinLadder('ladder_test'), '/api/ladder/ladder_test/join', {}],
        [() => remote.acceptLadderMember('ladder_test', 'user_one'), '/api/ladder/ladder_test/accept', { user_id: 'user_one' }],
        [() => remote.acceptLadderPair('ladder_test', ['user_one', 'user_two']), '/api/ladder/ladder_test/accept', { user_ids: ['user_one', 'user_two'] }],
        [() => remote.acceptTeamMember('team_test', 'user_one'), '/api/team/accept', { team_id: 'team_test', user_id: 'user_one' }],
        [() => remote.acceptGroupMember('group_test', 'user_one'), '/api/group/group_test/accept', { user_id: 'user_one' }],
        [() => remote.setRoundRole('round_test', 'available'), '/api/round/role', { round_id: 'round_test', role: 'available' }],
        [() => remote.setRoundRole('round_test', 'selected', 'user_one'), '/api/round/role', { round_id: 'round_test', role: 'selected', user_id: 'user_one' }],
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


test('quick actions support API responses without a navigation subject', async () => {
    let refreshes = 0;
    globalThis.fetch = async (_url, options) => {
        if (options.method === 'POST') return Response.json({ success: true, message: 'updated' });
        refreshes++;
        return Response.json([]);
    };
    const result = await remote.setRoundRole('round_test', 'unavailable');
    assert.equal(result.success, true);
    assert.equal(result.subject, undefined);
    assert.equal(refreshes, 1);
});


test('message functions target the right parent and never invent a navigation subject', async () => {
    for (const type of ['match','round','group']) {
        let body;
        globalThis.fetch = async (_url, options) => {
            if (options.method === 'POST') {
                body = JSON.parse(options.body);
                return Response.json({ success: true, message: 'sent' });
            }
            return Response.json([]);
        };
        assert.equal((await remote.createMessage(`${type}_test`, 'hello')).subject, undefined);
        assert.deepEqual(body.data, { [`${type}_id`]: `${type}_test`, text: 'hello' });
    }
    assert.throws(() => remote.createMessage('user_test', 'hello'), /Messages require/);
});

test('login and account creation remain unsigned while preserving the authenticated response', async () => {
    for (const [method, data, endpoint] of [
        ['loginUser', { email: 'a@example.test', otp: '123456', key: 'public' }, '/api/user/login'],
        ['createUser', { name: 'Alice', email: 'a@example.test', key: 'public' }, '/api/user/create']
    ]) {
        globalThis.fetch = async (url, options) => {
            if (options.method !== 'POST') return Response.json([]);
            assert.equal(new URL(url).pathname, endpoint);
            assert.deepEqual(JSON.parse(options.body), { data });
            return Response.json({ success: true, message: 'authenticated', subject: 'user_one', data: { user_id: 'user_one', device_id: 'device_new' } });
        };
        const result = await remote[method](data);
        assert.equal(result.subject, 'user_one');
        assert.equal(result.data.device_id, 'device_new');
    }
});

test('confirmation destinations come from entity IDs or safe local API paths', () => {
    assert.equal(remote.navigationHref('user_one'), '/user/user_one');
    assert.equal(remote.navigationHref('/browse'), '/browse');
    assert.equal(remote.navigationHref('/login'), '/login');
    assert.throws(() => remote.navigationHref('//outside.example'), /Invalid navigation/);
});
