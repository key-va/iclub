import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_PREFIX = 'iclub-test';

let server, page, guids, local, render;
const originalFetch = globalThis.fetch;

before(async () => {
    server = await createServer({
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true }
    });
    render = (await server.ssrLoadModule('svelte/server')).render;
    page = (await server.ssrLoadModule('/src/routes/user/[user_id]/+page.svelte')).default;
    guids = (await server.ssrLoadModule('/src/lib/stores/guids.ts')).guids;
    local = await server.ssrLoadModule('/src/lib/stores/local.ts');
});

after(async () => {
    globalThis.fetch = originalFetch;
    await server?.close();
});

async function renderUser({ format = 'singles', relation = {}, caller = 'user_admin', pair = false } = {}) {
    const items = [
        { pk: 'user', rk: 'user_viewed', name: 'Viewed user' },
        { pk: 'user', rk: 'user_admin', name: 'Administrator' },
        { pk: 'ladder', rk: 'ladder_test', name: 'Test ladder', format, state: 'active' },
        { pk: 'user_viewed', rk: 'ladder_test', ...relation },
        { pk: 'ladder_test', rk: 'user_viewed', ...relation },
        { pk: 'ladder_test', rk: 'user_admin', is_admin: true },
        { pk: 'user_admin', rk: 'ladder_test', is_admin: true }
    ];
    if (pair) items.push(
        { pk: 'pair', rk: 'pair_test', name: 'Pair' },
        { pk: 'ladder_test', rk: 'pair_test', is_participant: true, state: 'active', rank: 3 },
        { pk: 'pair_test', rk: 'user_viewed', role: 'member' }
    );
    globalThis.fetch = async () => new Response(JSON.stringify(items));
    await guids.load('https://example.test/guids.json');
    local.set_local_data({ caller_id: caller, device_id: null, connect_key: null });
    return render(page, {
        context: new Map([['__request__', { page: { params: { user_id: 'user_viewed' } } }]])
    }).body;
}

test('admin-only relations display administrator without an acceptance action', async () => {
    const html = await renderUser({ relation: { is_admin: true } });
    assert.match(html, /administrator/);
    assert.doesNotMatch(html, /aria-label="accept"|waiting to join/);
    assert.doesNotMatch(html, />pending</);
    assert.doesNotMatch(await renderUser({ relation: { is_admin: true }, caller: 'user_viewed' }), /aria-label="accept"|waiting to join/);
    assert.doesNotMatch(await renderUser(), />pending<|aria-label="accept"/);
});

test('only ladder admins can accept genuine pending singles requests', async () => {
    const relation = { state: 'pending', is_participant: false };
    assert.match(await renderUser({ relation }), /aria-label="accept"/);
    assert.doesNotMatch(await renderUser({ relation, caller: 'user_other' }), /aria-label="accept"/);
    assert.doesNotMatch(await renderUser({ relation: { state: 'pending', is_participant: true } }), /aria-label="accept"/);
});

test('pending doubles requests show a disabled waiting button only to admins', async () => {
    const relation = { is_admin: true, state: 'pending', is_participant: false };
    const html = await renderUser({ format: 'doubles', relation });
    assert.match(html, /<button class="grey" disabled[^>]*><p>waiting to join<\/p><\/button>/);
    assert.doesNotMatch(html, /aria-label="accept"/);
    assert.doesNotMatch(await renderUser({ format: 'doubles', relation, caller: 'user_other' }), /waiting to join/);
});

test('accepted doubles keep their pair state and rank without a waiting control', async () => {
    const html = await renderUser({
        format: 'doubles',
        relation: { is_admin: true, is_participant: true, state: 'active' },
        pair: true
    });
    assert.match(html, />available/);
    assert.match(html, /aria-label="active"><\/span>3/);
    assert.doesNotMatch(html, /aria-label="accept"|waiting to join/);
});
