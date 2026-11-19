import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { loadGraph } from './loadGraph.mjs';
process.env.VITE_PREFIX = 'iclub-test';
let server, render, guids, local, pages;
before(async () => {
    server = await createServer({
        plugins: [{ name: 'expose-page-actions', enforce: 'pre', transform(source, id) {
            const path = id.replaceAll('\\', '/');
            if (path.endsWith('/components/routeLink.svelte') || path.endsWith('/components/RouteLinkHiddenAction.svelte')) return `
                <script>let { href, title, description, detail, children } = $props();</script>
                <article><a {href}>{title}</a><p>{description}</p>{@render detail?.()}{@render children?.()}</article>`;
            if (path.endsWith('/components/hiddenOptions.svelte')) return `
                <script>let { title, children } = $props();</script><section aria-label={title}>{@render children?.()}</section>`;
            if (path.endsWith('/components/apiService.svelte')) return `
                <script>let { name, disabled = false, children } = $props();</script>
                <button aria-label={name} {disabled}>{name}</button>{@render children?.()}`;
        }}],
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error', optimizeDeps: { noDiscovery: true }
    });
    render = (await server.ssrLoadModule('svelte/server')).render;
    guids = (await server.ssrLoadModule('/src/lib/stores/guids.ts')).guids;
    local = await server.ssrLoadModule('/src/lib/stores/local.ts');
    pages = Object.fromEntries(await Promise.all(['group', 'team', 'round', 'match', 'user'].map(async type =>
        [type, (await server.ssrLoadModule(`/src/routes/${type}/[${type}_id]/+page.svelte`)).default])));
});
after(async () => { await server?.close(); });
function fixture() {
    const items = [
        { pk: 'user', rk: 'user_alice', name: 'Alice' },
        { pk: 'user', rk: 'user_bob', name: 'Bob' },
        { pk: 'user', rk: 'user_admin', name: 'Administrator' },
        { pk: 'club', rk: 'club_test', name: 'Club' },
        { pk: 'ladder', rk: 'ladder_test', name: 'Singles', state: 'active' },
        { pk: 'group', rk: 'group_test', name: 'Social group', state: 'active' },
        { pk: 'team', rk: 'team_test', name: 'Team A', state: 'active', ext_section_name: 'Division One', ext_rank: 2 },
        { pk: 'round', rk: 'round_test', name: 'Round 1', state: 'pending', ext_opponent: 'Visitors', ext_date: '2026-11-20' },
        { pk: 'match', rk: 'match_test', name: 'Alice versus Bob', state: 'pending' },
        { pk: 'message', rk: 'message_test', name: 'See you on court' }
    ];
    function link(a, b, attrs = {}) { items.push({ pk: a, rk: b, ...attrs }, { pk: b, rk: a, ...attrs }); }
    link('club_test', 'user_admin', { is_admin: true });
    for (const type of ['team', 'group', 'ladder']) {
        link('club_test', `${type}_test`);
        link(`${type}_test`, 'user_admin', { is_admin: true, is_member: true });
    }
    link('group_test', 'user_alice', { is_participant: true });
    link('group_test', 'user_bob', { state: 'pending' });
    link('team_test', 'user_alice', { is_member: true });
    link('team_test', 'user_bob', { state: 'pending' });
    link('team_test', 'round_test', { is_home: false });
    link('round_test', 'user_alice', { role: 'selected' });
    link('round_test', 'user_bob', { role: 'available' });
    link('match_test', 'ladder_test');
    link('match_test', 'user_alice', { role: 'challenger' });
    link('match_test', 'user_bob', { role: 'defender' });
    for (const type of ['match', 'round', 'group']) link(`${type}_test`, 'message_test');
    link('message_test', 'user_alice', { role: 'sender' });
    return items;
}
async function output(type, caller = 'user_admin', viewedUser = 'user_alice') {
    await loadGraph(guids, fixture());
    local.setLocalData({ caller_id: caller, device_id: null, connect_key: null });
    return render(pages[type], {
        context: new Map([['__request__', { page: { params: { [`${type}_id`]: type === 'user' ? viewedUser : `${type}_test` } } }]])
    }).body;
}
function hasAction(html, name) { return html.includes(`aria-label="${name}"`); }

test('group names, participants, pending approvals and message senders resolve separately', async () => {
    const html = await output('group');
    assert.match(html, /Social group/);
    assert.match(html, /href="\/user\/user_alice">Alice/);
    assert.match(html, /href="\/user\/user_bob">Bob/);
    assert.match(html, /See you on court/);
    assert.equal(hasAction(html, 'accept'), true);
    assert.equal(hasAction(await output('group', 'user_alice'), 'accept'), false);
});
test('team member roles and derived round details survive raw relation lookups', async () => {
    const html = await output('team');
    assert.match(html, /Team A/);
    assert.match(html, /Round 1/);
    assert.match(html, /2026-11-20/);
    assert.match(html, /href="\/user\/user_alice">Alice/);
    assert.equal(hasAction(html, 'accept'), true);
    assert.equal(hasAction(await output('team', 'user_alice'), 'accept'), false);
});
test('round roles drive availability and selection while names come from entities', async () => {
    const html = await output('round');
    assert.match(html, /Visitors vs Team A/);
    assert.match(html, /See you on court/);
    assert.equal(hasAction(html, 'select'), true);
    const player = await output('round', 'user_alice');
    assert.equal(hasAction(player, 'unavailable'), true);
    assert.equal(hasAction(player, 'select'), false);
});
test('match defender permissions, competitor names and messages survive the lookup migration', async () => {
    const html = await output('match', 'user_bob');
    assert.match(html, /Alice versus Bob/);
    assert.match(html, /See you on court/);
    assert.match(html, /waiting for <strong>Bob/);
    assert.equal(hasAction(html, 'accept'), true);
    assert.equal(hasAction(await output('match', 'user_alice'), 'accept'), false);
});
test('user home resolves team details and outstanding round role/date separately', async () => {
    const html = await output('user', 'user_alice');
    assert.match(html, /Team A/);
    assert.match(html, /division one • rank 2/);
    assert.match(html, /Round 1/);
    assert.match(html, /2026-11-20/);
    assert.match(html, /selected/);
});

test('pending team/group memberships on user pages retain admin acceptance actions', async () => {
    const html = await output('user', 'user_admin', 'user_bob');
    assert.match(html, /Social group/);
    assert.match(html, /Team A/);
    assert.equal((html.match(/aria-label="accept"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-label="accept joiner"/g) ?? []).length, 1);
    assert.equal(hasAction(await output('user', 'user_bob', 'user_bob'), 'accept'), false);
});
