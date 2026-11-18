import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_PREFIX = 'iclub-test';
let server, render, guids, local, rules, components, graph, ladderPage;
const originalFetch = globalThis.fetch;

before(async () => {
    server = await createServer({
        plugins: [{
            name: 'expose-ladder-actions',
            enforce: 'pre',
            transform(source, id) {
                const path = id.replaceAll('\\', '/');
                // Exercise feature logic independently of reveal/confirmation mechanics.
                if (path.endsWith('/components/routeLink.svelte') || path.endsWith('/components/RouteLinkHiddenAction.svelte')) return `
                    <script>let { href, title, description, image, detail, children } = $props();</script>
                    <article><a {href} data-image={image}>{title}</a><p>{description}</p>
                    {@render detail?.()}{@render children?.()}</article>`;
                if (path.endsWith('/components/hiddenOptions.svelte')) return `
                    <script>let { title, children } = $props();</script>
                    <section aria-label={title}>{@render children?.()}</section>`;
                if (path.endsWith('/stores/remote.ts')) return `
                    export const acceptTeamMember = (id, user) => ({ endpoint: 'team/accept', data: { team_id: id, user_id: user } });
                    export const acceptGroupMember = (id, user) => ({ endpoint: 'group/' + id + '/accept', data: { user_id: user } });
                    export const setRoundRole = (id, role) => ({ endpoint: 'round/role', data: { round_id: id, role } });
                    export const activateLadder = id => ({ endpoint: 'ladder/' + id + '/activate', data: {} });
                    export const joinLadder = id => ({ endpoint: 'ladder/' + id + '/join', data: {} });
                    export const acceptLadderMember = (id, user) => ({ endpoint: 'ladder/' + id + '/accept', data: { user_id: user } });
                    export const acceptLadderPair = (id, users) => ({ endpoint: 'ladder/' + id + '/accept', data: { user_ids: users } });
                    export const createMatch = (id, challenger, defender) => ({ endpoint: 'match/create', data: { ladder_id: id, challenger_id: challenger, defender_id: defender } });`;
                // Resolve callbacks against synchronous endpoint descriptors in this
                // fixture only; real components must never invoke actions on render.
                if (/\/components\/Action(?:Quick|Confirmation)\.svelte$/.test(path)) return `
                    <script>let { name, action, disabled = false } = $props();
                    const request = $derived(action());</script>
                    <button aria-label={name} {disabled} data-endpoint={request.endpoint}
                        data-payload={JSON.stringify(request.data)}>{name}</button>`;
                if (path.endsWith('/components/apiService.svelte')) return `
                    <script>let { name, endpoint, data, disabled = false } = $props();</script>
                    <button aria-label={name} {disabled} data-endpoint={endpoint}
                        data-payload={JSON.stringify(data)}>{name}</button>`;
            }
        }],
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error', optimizeDeps: { noDiscovery: true }
    });
    render = (await server.ssrLoadModule('svelte/server')).render;
    guids = (await server.ssrLoadModule('/src/lib/stores/guids.ts')).guids;
    local = await server.ssrLoadModule('/src/lib/stores/local.ts');
    rules = await server.ssrLoadModule('/src/lib/components/ladders/ladderRules.ts');
    graph = await server.ssrLoadModule('/src/lib/stores/guids.ts');
    ladderPage = (await server.ssrLoadModule('/src/routes/ladder/[ladder_id]/+page.svelte')).default;
    components = Object.fromEntries(await Promise.all(
        ['LadderUser', 'LadderPair', 'UserLadder', 'LadderRequests'].map(async name =>
            [name, (await server.ssrLoadModule(`/src/lib/components/ladders/${name}.svelte`)).default])
    ));
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

function fixture(format = 'singles') {
    const items = [
        { pk: 'ladder', rk: 'ladder_test', name: 'Test ladder', format, state: 'active', ladder_system: 'static_range_3' },
        ...['me', 'other', 'partner', 'admin'].map(id => ({ pk: 'user', rk: `user_${id}`, name: id }))
    ];
    const link = (a, b, attrs) => items.push({ pk: a, rk: b, ...attrs }, { pk: b, rk: a, ...attrs });
    link('ladder_test', 'user_admin', { is_admin: true });
    if (format === 'singles') {
        link('ladder_test', 'user_me', { is_participant: true, rank: 4, state: 'active' });
        link('ladder_test', 'user_other', { is_participant: true, rank: 2, state: 'cooling' });
    } else {
        for (const [id, rank, state] of [['mine', 4, 'active'], ['other', 2, 'cooling']]) {
            items.push({ pk: 'pair', rk: `pair_${id}`, name: `${id} pair` });
            link('ladder_test', `pair_${id}`, { is_participant: true, rank, state });
        }
        link('pair_mine', 'user_me', { role: 'member' });
        link('pair_mine', 'user_partner', { role: 'member' });
        link('pair_other', 'user_other', { role: 'member' });
        link('ladder_test', 'user_me', { is_admin: true, is_participant: true, rank: 99, state: 'active' });
        link('ladder_test', 'user_other', { is_participant: true, rank: 88, state: 'active' });
    }
    return { items, link, ladder: items[0] };
}
async function load(items, caller = 'user_me') {
    globalThis.fetch = async () => new Response(JSON.stringify(items));
    await guids.load('https://example.test/guids.json');
    local.setLocalData({ caller_id: caller, device_id: null, connect_key: null });
}
function html(name, props) { return render(components[name], { props }).body; }
function action(markup, name) {
    const tag = [...markup.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
        .find(tag => tag.includes(`aria-label="${name}"`));
    if (!tag) return undefined;
    return {
        disabled: /\sdisabled(?:\s|=|>)/.test(tag),
        endpoint: tag.match(/data-endpoint="([^"]*)"/)?.[1],
        data: JSON.parse(tag.match(/data-payload="([^"]*)"/)?.[1].replaceAll('&quot;', '"') ?? 'null')
    };
}

test('singles standings resolve challenge identity, reach, state and self restrictions', async () => {
    const { items, ladder } = fixture();
    await load(items);
    const user = graph.relationsOf(ladder.rk).filter(row => graph.typeOf(row.rk) === 'user').find(row => row.rk === 'user_other');
    const props = { ladder, user };
    let output = html('LadderUser', props);
    assert.match(output, /href="\/user\/user_other"/);
    assert.equal(action(output, 'challenge').disabled, false);
    assert.deepEqual(action(output, 'challenge').data,
        { ladder_id: ladder.rk, challenger_id: 'user_me', defender_id: 'user_other' });
    await load(items, 'user_other');
    assert.equal(action(html('LadderUser', props), 'challenge').disabled, true);
    await load(items, 'user_admin');
    assert.equal(action(html('LadderUser', props), 'challenge').disabled, true);
    await load(items);
    user.state = 'away';
    assert.equal(action(html('LadderUser', props), 'challenge').disabled, true);
});

test('doubles resolve pair standing and either partner as the same challenger', async () => {
    const { items, ladder } = fixture('doubles');
    await load(items);
    const membership = rules.ladderMembership( ladder, 'user_me');
    assert.equal(membership.userRelation.rank, 99);
    assert.equal(membership.userRelation.is_admin, true);
    assert.equal(membership.relation.rank, 4);
    assert.equal(membership.competitorId, 'pair_mine');
    const pair = graph.relationsOf(ladder.rk).filter(row => graph.typeOf(row.rk) === 'pair').find(row => row.rk === 'pair_other');
    for (const caller of ['user_me', 'user_partner']) {
        await load(items, caller);
        const output = html('LadderPair', { ladder, pair });
        assert.match(output, /href="\/pair\/pair_other"/);
        assert.match(output, /data-image="[^"]*ladder_test.jpg"/);
        assert.equal(action(output, 'challenge').disabled, false);
        assert.equal(action(output, 'challenge').data.challenger_id, 'pair_mine');
    }
    await load(items, 'user_other');
    assert.equal(action(html('LadderPair', { ladder, pair }), 'challenge').disabled, true);
    // Retired memberships must never supply an active competitive identity.
    items.find(row => row.pk === ladder.rk && row.rk === 'pair_mine').is_participant = false;
    await load(items, 'user_me');
    assert.equal(rules.ladderMembership( ladder, 'user_me').competitorId, null);
    assert.equal(action(html('LadderPair', { ladder, pair }), 'challenge').disabled, true);
});

test('user ladder sections isolate ongoing matches to the viewed user and ladder', async () => {
    const { items, link, ladder } = fixture();
    const user = items.find(row => row.pk === 'user' && row.rk === 'user_other');
    for (const [id, state, parent] of [['live', 'active', ladder.rk], ['done', 'complete', ladder.rk], ['elsewhere', 'active', 'ladder_elsewhere']]) {
        items.push({ pk: 'match', rk: `match_${id}`, name: id, state });
        link(user.rk, `match_${id}`, { role: 'defender' });
        link(parent, `match_${id}`, {});
    }
    await load(items);
    const output = html('UserLadder', { user, ladder });
    assert.match(output, /href="\/match\/match_live"/);
    assert.doesNotMatch(output, /href="\/match\/match_(done|elsewhere)"/);
    assert.equal(action(output, 'challenge'), undefined);
});

test('pending application controls are limited to ladder admins and honour ladder format', async () => {
    for (const format of ['singles', 'doubles']) {
        const { items, link, ladder } = fixture(format);
        link(ladder.rk, 'user_partner', { state: 'pending', is_participant: false });
        await load(items, 'user_me');
        // For doubles this fixture makes user_me an administrator.
        if (format === 'singles') assert.equal(action(html('LadderRequests', { ladder }), 'accept'), undefined);
        await load(items, 'user_admin');
        const output = html('LadderRequests', { ladder });
        if (format === 'singles') {
            assert.equal(action(output, 'accept').endpoint, `ladder/${ladder.rk}/accept`);
            assert.deepEqual(action(output, 'accept').data, { user_id: 'user_partner' });
        } else {
            assert.match(output, /aria-label="select player"/);
            assert.equal(action(output, 'accept'), undefined);
        }
        await load(items, 'user_other');
        assert.doesNotMatch(html('LadderRequests', { ladder }), /aria-label="(?:accept|select player)"/);
    }
});

test('user doubles section displays the pair standing instead of the user membership rank', async () => {
    const { items, ladder } = fixture('doubles');
    await load(items);
    const output = html('UserLadder', { ladder, user: graph.entityOf( 'user_other') });
    assert.match(output, /cooling[\s\S]*?2/);
    assert.doesNotMatch(output, /<\/span>88/);
    assert.equal(action(output, 'challenge'), undefined);
});

test('ladder page chooses users or pairs and orders competitive standings by rank', async () => {
    for (const format of ['singles', 'doubles']) {
        const { items } = fixture(format);
        await load(items);
        const output = render(ladderPage, {
            context: new Map([['__request__', { page: { params: { ladder_id: 'ladder_test' } } }]])
        }).body;
        const first = format === 'singles' ? '/user/user_other' : '/pair/pair_other';
        const second = format === 'singles' ? '/user/user_me' : '/pair/pair_mine';
        assert.ok(output.includes(`href="${first}"`));
        assert.ok(output.indexOf(`href="${first}"`) < output.indexOf(`href="${second}"`));
        if (format === 'doubles') assert.doesNotMatch(output, /href="\/user\/user_(?:me|other)"/);
    }
});

test('ladder approval and join confirmations use the requested labels and permissions', async () => {
    const { items, ladder, link } = fixture();
    const renderPage = () => render(ladderPage, {
        context: new Map([['__request__', { page: { params: { ladder_id: ladder.rk } } }]])
    }).body;
    ladder.state = 'pending';
    items.push({ pk: 'club', rk: 'club_test', name: 'Club' });
    link(ladder.rk, 'club_test', {});
    link('club_test', 'user_admin', { is_admin: true });
    await load(items, 'user_admin');
    assert.equal(action(renderPage(), 'approve this ladder').disabled, false);
    assert.equal(action(renderPage(), 'approve this ladder').endpoint, `ladder/${ladder.rk}/activate`);
    await load(items, 'user_me');
    assert.equal(action(renderPage(), 'approve this ladder').disabled, true);
    ladder.state = 'active';
    await load(items, 'user_outsider');
    assert.equal(action(renderPage(), 'request to join').disabled, false);
    assert.equal(action(renderPage(), 'request to join').endpoint, `ladder/${ladder.rk}/join`);
    await load(items, null);
    assert.equal(action(renderPage(), 'request to join').disabled, true);
});
