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
                <script>let { href, title, description, detail, children, colour, isWhite, currentSelection } = $props();</script>
                <article data-colour={colour} data-white={isWhite}><a {href}>{title}</a><p>{description}</p>{@render detail?.()}{@render children?.()}{#if !children && currentSelection}<button disabled><p>{currentSelection}</p></button>{/if}</article>`;
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
    pages = Object.fromEntries(await Promise.all(['group', 'team', 'round', 'match', 'user', 'comp', 'pair', 'browse'].map(async type =>
        [type, (await server.ssrLoadModule(type === 'browse' ? '/src/routes/browse/+page.svelte' : `/src/routes/${type}/[${type}_id]/+page.svelte`)).default])));
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
async function output(type, caller = 'user_admin', viewedId, items = fixture()) {
    await loadGraph(guids, items);
    local.setLocalData({ caller_id: caller, device_id: null, connect_key: null });
    return render(pages[type], {
        context: new Map([['__request__', { page: { params: { [`${type}_id`]: viewedId ?? (type === 'user' ? 'user_alice' : `${type}_test`) } } }]])
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
    const items = fixture();
    items.find((row) => row.pk === 'team').ext_standings =
        JSON.stringify([{ name: 'Team A', points: 9, wins: 2, rank: 2 }]);
    items.push(
        { pk: 'round', rk: 'round_later', name: 'Round 2', state: 'pending', ext_number: 2, ext_opponent: 'Other team', ext_date: '2026-11-27' },
        { pk: 'team_test', rk: 'round_later', is_home: true }
    );
    items.find((row) => row.pk === 'round' && row.rk === 'round_test').ext_number = 1;
    const html = await output('team', 'user_admin', undefined, items);
    assert.match(html, /Team A/);
    assert.match(html, /data-colour="red" data-white="true"[^>]*><a href="\/round\/round_test">Round 1<\/a><p>away • 1 playing • 1 available/);
    assert.match(html, /1 available[\s\S]*aria-label="Leaderboard"[\s\S]*aria-label="Future Rounds"[\s\S]*Round 2[\s\S]*aria-label="refresh data"[\s\S]*aria-label="Members"[\s\S]*aria-label="Past Rounds"/);
    assert.match(html, /Round 1/);
    assert.match(html, /2026-11-27/);
    assert.equal((html.match(/href="\/round\/round_test"/g) ?? []).length, 1);
    assert.match(html, /href="\/user\/user_alice">Alice/);
    assert.equal(hasAction(html, 'accept'), true);
    assert.equal(hasAction(await output('team', 'user_alice'), 'accept'), false);
    const visitor = await output('team', 'user_visitor', undefined, items);
    assert.match(visitor, /Round 1<\/a>[\s\S]*?<button[^>]*disabled[^>]*><p>no actions<\/p><\/button>/);
    assert.match(visitor, /Round 2<\/a>[\s\S]*?<button[^>]*disabled[^>]*><p>no actions<\/p><\/button>/);
    assert.equal(hasAction(visitor, 'available'), false);
    assert.equal(hasAction(visitor, 'out'), false);
});
test('round roles drive availability and selection while names come from entities', async () => {
    const html = await output('round');
    assert.match(html, /Visitors vs Team A/);
    assert.match(html, /See you on court/);
    assert.equal(hasAction(html, 'mark playing'), true);
    const player = await output('round', 'user_alice');
    assert.equal(hasAction(player, 'out'), true);
    assert.equal(hasAction(player, 'mark playing'), false);
});
test('profile ladder match dots distinguish active, defending and waiting viewers', async () => {
    const rows = fixture();
    rows.push(
        { pk: 'user_bob', rk: 'ladder_test', is_participant: true, state: 'busy', rank: 1 },
        { pk: 'user_bob', rk: 'match_test', role: 'defender' },
        { pk: 'user_alice', rk: 'ladder_test', is_participant: true, state: 'busy', rank: 2 },
        { pk: 'user_alice', rk: 'match_test', role: 'challenger' }
    );
    const defender = await output('user', 'user_bob', 'user_bob', rows);
    assert.match(defender, /data-colour="red"[^>]*><a [^>]*>Alice versus Bob/);
    assert.match(defender, /<button class="blue" aria-label="accept"/);
    assert.match(defender, /<button class="grey" aria-label="withdraw"[^>]*disabled/);
    for (const viewer of ['user_alice', 'user_visitor', 'user_admin']) {
        const waiting = await output('user', viewer, 'user_alice', rows);
        assert.match(waiting, /data-colour="orange"[^>]*><a [^>]*>Alice versus Bob/);
        assert.match(waiting, /<button class="grey" aria-label="accept"[^>]*disabled/);
        if (viewer === 'user_alice') assert.match(waiting, /<button class="blue" aria-label="withdraw"/);
        else assert.match(waiting, /<button class="grey" aria-label="withdraw"[^>]*disabled/);
    }
    rows.find((row) => row.pk === 'match' && row.rk === 'match_test').state = 'active';
    const active = await output('user', 'user_bob', 'user_bob', rows);
    assert.match(active, /data-colour="green"[^>]*><a [^>]*>Alice versus Bob/);
    for (const name of ['accept', 'withdraw'])
        assert.match(active, new RegExp(`aria-label="${name}"[^>]*disabled`));
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
    assert.match(html, /Division One • rank 2/);
    assert.match(html, /Round 1/);
    assert.match(html, /2026-11-20/);
    assert.match(html, /playing/);
});

test('pending team/group memberships on user pages retain admin acceptance actions', async () => {
    const html = await output('user', 'user_admin', 'user_bob');
    assert.match(html, /Social group/);
    assert.match(html, /Team A/);
    assert.equal((html.match(/aria-label="accept"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-label="accept joiner"/g) ?? []).length, 1);
    assert.equal(hasAction(await output('user', 'user_bob', 'user_bob'), 'accept'), false);
});

test('Competition page mirrors ladder controls and scopes requests and ranking by role', async () => {
    const rows = [
        ...fixture(),
        { pk: 'comp', rk: 'comp_test', name: 'Club knockout', competition_type: 'elimination', state: 'open' },
        { pk: 'comp_test', rk: 'club_test' },
        { pk: 'comp_test', rk: 'user_admin', is_admin: true, is_participant: true },
        { pk: 'comp_test', rk: 'user_alice', is_participant: true, seed: 1 },
        { pk: 'comp_test', rk: 'user_bob', state: 'pending' }
    ];
    const admin = await output('comp', 'user_admin', undefined, rows);
    assert.match(admin, /elimination • singles • super set • entries open/);
    assert.match(admin, /data-colour="blue"[^>]*><a [^>]*>Alice/);
    assert.match(admin, /data-colour="grey"[^>]*><a [^>]*>Administrator/);
    assert.match(admin, /data-colour="orange"[^>]*><a [^>]*>Bob/);
    assert.equal(hasAction(admin, 'Accept Bob'), true);
    assert.equal(hasAction(admin, 'Unrank Alice'), true);
    assert.equal(hasAction(admin, 'Rank Administrator'), true);
    assert.match(admin, /entries open[\s\S]*waiting to join[\s\S]*Players[\s\S]*More Options/);
    assert.equal(hasAction(admin, 'start draw'), true);

    const player = await output('comp', 'user_alice', undefined, rows);
    assert.match(player, /data-colour="blue"[^>]*><a [^>]*>Alice/);
    assert.match(player, /ranked 1/);
    assert.match(player, /<button[^>]*disabled[^>]*><p>unranked<\/p>/);
    assert.doesNotMatch(player, /waiting to join|Accept Bob|Unrank Alice/);
    assert.match(player, /More Options[\s\S]*aria-label="withdraw"/);
    assert.equal(hasAction(player, 'start draw'), false);

    const applicant = await output('comp', 'user_bob', undefined, rows);
    assert.match(applicant, /Bob[\s\S]*join request pending/);
    assert.match(applicant, /aria-label="request to join"[^>]*disabled/);
    assert.equal(hasAction(applicant, 'Accept Bob'), false);

    const extendedRows = [...rows, { pk: 'user', rk: 'user_visitor', name: 'Visitor' }];
    const visitor = await output('comp', 'user_visitor', undefined, extendedRows);
    assert.match(visitor, /aria-label="request to join"[\s\S]*Players/);
    assert.doesNotMatch(visitor, /Bob|More Options/);

    rows.find(row => row.rk === 'comp_test').state = 'pending';
    const approval = await output('comp', 'user_admin', undefined, rows);
    assert.match(approval, /Club knockout<\/strong><br\s*\/?><span class="description">comp<\/span>/);
    assert.match(approval, /awaiting club approval[\s\S]*aria-label="approve"/);
    assert.doesNotMatch(approval, /Accept Bob|Unrank Alice|start draw/);

    rows.find(row => row.rk === 'comp_test').state = 'active';
    const drawn = await output('comp', 'user_admin', undefined, rows);
    assert.match(drawn, /ranked 1/);
    assert.equal(hasAction(drawn, 'Unrank Alice'), false);
});
test('Browse shows active entities and competitions accepting entries', async () => {
    const rows = [
        { pk: 'ladder', rk: 'ladder_active', name: 'Open ladder', state: 'active' },
        { pk: 'team', rk: 'team_pending', name: 'Pending team', state: 'pending' },
        { pk: 'group', rk: 'group_pending', name: 'Pending group', state: 'pending' },
        { pk: 'comp', rk: 'comp_pending', name: 'Pending comp', state: 'pending' },
        { pk: 'comp', rk: 'comp_open', name: 'Open entries', state: 'open' },
        { pk: 'comp', rk: 'comp_active', name: 'Active draw', state: 'active' },
        { pk: 'comp', rk: 'comp_finished', name: 'Finished draw', state: 'complete' }
    ];
    const html = await output('browse', 'user_admin', undefined, rows);
    assert.match(html, /Open ladder/);
    assert.match(html, /Open entries<\/a><p>comp<\/p>/);
    assert.match(html, /Active draw/);
    assert.doesNotMatch(html, /data-white="true"|Pending team|Pending group|Pending comp|Finished draw/);
    const profile = await output('user', 'user_admin', 'user_admin', [
        ...fixture(), ...rows,
        ...rows.flatMap((row) => [
            { pk: 'user_admin', rk: row.rk, is_participant: true },
            { pk: 'club_test', rk: row.rk }
        ])
    ]);
    assert.match(profile, /Open ladder/);
    assert.match(profile, /Open entries/);
    assert.match(profile, /Active draw/);
    assert.doesNotMatch(profile, /Pending team|Pending group|Pending comp|Finished draw/);
});

test('doubles comp displays pair seeding and lets either partner access the match actions', async () => {
    const rows = [
        ...fixture(),
        { pk: 'comp', rk: 'comp_test', name: 'Doubles knockout', comp_system: 'elimination', format: 'doubles', match_format: 'fast_four', state: 'open' },
        { pk: 'pair', rk: 'pair_first', name: 'Alice and Bob' },
        { pk: 'pair', rk: 'pair_second', name: 'Chris and Dana' },
        { pk: 'user', rk: 'user_chris', name: 'Chris' },
        { pk: 'user', rk: 'user_dana', name: 'Dana' }
    ];
    function link(a, b, attrs) { rows.push({ pk: a, rk: b, ...attrs }, { pk: b, rk: a, ...attrs }); }
    link('comp_test', 'user_admin', { is_admin: true });
    link('comp_test', 'pair_first', { is_participant: true, seed: 1 });
    for (const user of ['user_alice', 'user_bob']) {
        link('comp_test', user, { is_participant: true });
        link('pair_first', user, { role: 'member' });
    }
    for (const user of ['user_chris', 'user_dana']) {
        link('comp_test', user, { state: 'pending' });
        link('pair_second', user, { role: 'member' });
    }
    const open = await output('comp', 'user_admin', undefined, rows);
    assert.match(open, /elimination • doubles • fast four/);
    assert.match(open, /aria-label="Pairs"/);
    assert.equal(hasAction(open, 'select player'), true);
    assert.equal(hasAction(open, 'Unrank Alice and Bob'), true);
    assert.equal(hasAction(open, 'Rank Alice'), false);

    rows.find(row => row.pk === 'comp' && row.rk === 'comp_test').state = 'active';
    rows.push({ pk: 'match', rk: 'match_doubles', name: 'Alice and Bob vs Chris and Dana', state: 'active' });
    link('comp_test', 'match_doubles', {});
    link('match_doubles', 'pair_first', { role: 'competitor', slot: 1 });
    link('match_doubles', 'pair_second', { role: 'competitor', slot: 2 });
    for (const user of ['user_alice', 'user_bob', 'user_chris', 'user_dana'])
        link('match_doubles', user, { role: 'participant' });
    const bob = await output('user', 'user_bob', 'user_bob', rows);
    assert.match(bob, /Doubles knockout<\/a><p>ranked 1[\s\S]*Alice and Bob vs Chris and Dana/);
    assert.equal(hasAction(bob, 'forfeit'), false);
    rows.push({ pk: 'match', rk: 'match_previous', state: 'complete' });
    link('pair_first', 'match_previous', { result: 'loser' });
    const pair = await output('pair', 'user_bob', 'pair_first', rows);
    assert.match(pair, /0 won • lost 1/);
    assert.match(pair, /public\/comp_test\.jpg/);
    assert.match(pair, /Alice<\/a><p>member[\s\S]*Bob<\/a><p>member[\s\S]*Doubles knockout<\/a><p>ranked 1/);
    assert.match(pair, /aria-label="Match History"/);
    const match = await output('match', 'user_bob', 'match_doubles', rows);
    assert.equal((match.match(/background-image: url\('[^']*\/comp_test\.jpg'\)/g) ?? []).length >= 2, true);
    assert.doesNotMatch(match, /\/pair_(?:first|second)\.jpg/);
    assert.match(match, /Alice and Bob[\s\S]*Chris and Dana/);
    assert.match(match, /aria-label="Alice and Bob set 3"/);
    assert.match(match, /pattern="\[0-4\]"/);
    assert.equal(hasAction(match, 'submit'), true);
    assert.equal(hasAction(match, 'forfeit'), true);
    assert.equal(hasAction(await output('match', 'user_admin', 'match_doubles', rows), 'forfeit'), false);
});

test('Competition rounds and user profiles show active matches and elimination status', async () => {
    const rows = [
        ...fixture(),
        { pk: 'comp', rk: 'comp_test', name: 'Club knockout', comp_system: 'elimination', state: 'active' },
        { pk: 'round', rk: 'round_final', name: 'Club knockout Final' },
        { pk: 'match', rk: 'match_final', name: 'Alice vs Administrator', state: 'active' },
        { pk: 'match', rk: 'match_waiting', name: 'R1 Pending', state: 'waiting' },
        { pk: 'match', rk: 'match_result', name: 'Alice vs Bob', state: 'complete' },
        { pk: 'comp_test', rk: 'round_final', bracket_round: 2 },
        { pk: 'round_final', rk: 'match_final', bracket_match: 1 },
        { pk: 'round_final', rk: 'match_waiting', bracket_match: 2 },
        { pk: 'match_final', rk: 'comp_test' },
        { pk: 'match_result', rk: 'comp_test' },
        { pk: 'match_final', rk: 'user_alice', role: 'competitor', slot: 1 },
        { pk: 'match_final', rk: 'user_admin', role: 'competitor', slot: 2 },
        { pk: 'user_alice', rk: 'match_final', role: 'competitor' },
        { pk: 'user_bob', rk: 'match_result', result: 'loser' },
        { pk: 'comp_test', rk: 'user_alice', is_participant: true, seed: 1 },
        { pk: 'comp_test', rk: 'user_bob', is_participant: true, seed: 2 },
        { pk: 'user_alice', rk: 'comp_test', is_participant: true, seed: 1 },
        { pk: 'user_bob', rk: 'comp_test', is_participant: true, seed: 2 }
    ];
    const comp = await output('comp', 'user_alice', undefined, rows);
    assert.match(comp, /data-colour="green"[^>]*><a [^>]*>Alice vs Administrator<\/a>[\s\S]*aria-label="Players"/);
    assert.match(comp, /data-colour="red"[^>]*><a [^>]*>Bob<\/a><p>eliminated/);
    assert.match(comp, /aria-label="Club knockout Final"[\s\S]*data-white="true"[^>]*><a [^>]*>Alice vs Administrator/);
    assert.match(comp, /data-white="false"[^>]*><a [^>]*>R1 Pending/);

    const alice = await output('user', 'user_alice', 'user_alice', rows);
    assert.match(alice, /Club knockout<\/a><p>ranked 1[\s\S]*data-colour="green"[^>]*><a [^>]*>Alice vs Administrator/);
    assert.equal(hasAction(alice, 'forfeit'), false);
    assert.equal(hasAction(await output('user', 'user_visitor', 'user_alice', rows), 'forfeit'), false);
    const bob = await output('user', 'user_bob', 'user_bob', rows);
    assert.match(bob, /Club knockout<\/a><p>eliminated[\s\S]*No pending matches/);

    const match = await output('match', 'user_alice', 'match_final', rows);
    assert.match(match, /competitor/);
    assert.doesNotMatch(match, />challenger<|>defender</);
    assert.match(match, /aria-label="help"[\s\S]*aria-label="submit"/);
    assert.match(match, /aria-label="More Options"[\s\S]*aria-label="forfeit"/);
    const adminRows = [...rows, { pk: 'comp_test', rk: 'user_bob', is_admin: true }];
    assert.equal(hasAction(await output('match', 'user_bob', 'match_final', adminRows), 'forfeit'), false);

    rows.find(row => row.pk === 'comp' && row.rk === 'comp_test').state = 'complete';
    rows.find(row => row.pk === 'match' && row.rk === 'match_final').state = 'complete';
    rows.find(row => row.pk === 'match_final' && row.rk === 'user_alice').result = 'winner';
    rows.find(row => row.pk === 'match_final' && row.rk === 'user_admin').result = 'loser';
    rows.push(
        { pk: 'user_admin', rk: 'match_final', result: 'loser' },
        { pk: 'comp_test', rk: 'user_admin', is_participant: true },
    );
    const completed = await output('comp', 'user_alice', undefined, rows);
    assert.match(completed, /data-colour="green"[^>]*><a [^>]*>Alice<\/a><p>champion/);
    assert.match(completed, /data-colour="red"[^>]*><a [^>]*>Administrator<\/a><p>eliminated/);
    assert.doesNotMatch(await output('user', 'user_alice', 'user_alice', rows), /Club knockout/);
    const final = await output('match', 'user_alice', 'match_final', rows);
    assert.match(final, /champion/);
    assert.match(final, /eliminated/);

});

test('A comp bye shows the player’s saved name in a centred white group', async () => {
    const rows = [
        ...fixture(),
        { pk: 'comp', rk: 'comp_test', comp_system: 'elimination', state: 'active' },
        { pk: 'match', rk: 'match_bye', name: 'Alice (bye)', state: 'bye' },
        { pk: 'match_bye', rk: 'comp_test' },
        { pk: 'match_bye', rk: 'user_alice', role: 'competitor', slot: 1, result: 'bye' },
    ];
    const html = await output('match', 'user_alice', 'match_bye', rows);
    assert.match(html, /<div class="group"><p class="info center">Alice advances with a bye\.<\/p><\/div>/);
});

test('User profiles count completed wins and losses and match headers keep the entity type', async () => {
    const rows = [...fixture()];
    for (const [suffix, state, result] of [
        ['win', 'complete', 'winner'], ['loss', 'complete', 'loser'],
        ['forfeit', 'complete', 'forfeiter'], ['walkover', 'complete', 'walkover'],
        ['bye', 'bye', 'bye'], ['active', 'active', 'winner'],
    ]) {
        rows.push(
            { pk: 'match', rk: `match_${suffix}`, name: `Match ${suffix}`, state },
            { pk: 'user_alice', rk: `match_${suffix}`, result },
        );
    }
    const profile = await output('user', 'user_alice', 'user_alice', rows);
    assert.match(profile, /<div class="group"><p class="info center description">1 won • lost 3<\/p>/);
    assert.match(await output('user', 'user_bob', 'user_bob', rows), /0 won • lost 0/);

    const match = await output('match', 'user_alice', 'match_win', rows);
    assert.match(match, /Match win<\/strong><br\s*\/?><span class="description">match<\/span>/);
});

test('Round Robin shows standings, scheduled fixtures and joint champions without seeding', async () => {
    const rows = [
        ...fixture(),
        { pk: 'comp', rk: 'comp_test', name: 'Club round robin', comp_system: 'round_robin', state: 'active' },
        { pk: 'round', rk: 'round_robin', name: 'Round 1' }
    ];
    function link(a, b, attrs = {}) { rows.push({ pk: a, rk: b, ...attrs }, { pk: b, rk: a, ...attrs }); }
    const players = ['user_alice', 'user_bob', 'user_admin'];
    for (const player of players) link('comp_test', player, { is_participant: true, is_admin: player === 'user_admin' });
    link('comp_test', 'round_robin', { bracket_round: 1 });
    link('round_robin', 'user_admin', { role: 'bye' });
    for (const [i, winner] of players.entries()) {
        const match = `match_robin_${i}`;
        rows.push({ pk: 'match', rk: match, name: `Fixture ${i}`, state: i === 0 ? 'waiting' : 'complete' });
        link('round_robin', match, { bracket_match: i + 1 });
        link('comp_test', match);
        link(match, winner, { role: 'competitor', slot: 1, result: 'winner', score: 8 });
        link(match, players[(i + 1) % players.length], { role: 'competitor', slot: 2, result: 'loser', score: 4 });
    }
    const running = await output('comp', 'user_admin', undefined, rows);
    assert.match(running, /round robin • singles/);
    assert.match(running, /aria-label="Standings"/);
    assert.match(running, /1 points • rank 2/);
    assert.match(running, /Fixture 0<\/a><p>scheduled/);
    assert.doesNotMatch(running, /aria-label="(?:Rank|Unrank) /);
    rows.find(row => row.pk === 'comp' && row.rk === 'comp_test').state = 'complete';
    rows.find(row => row.pk === 'match' && row.rk === 'match_robin_0').state = 'complete';
    const complete = await output('comp', 'user_admin', undefined, rows);
    assert.equal((complete.match(/1 points • rank 1 • champion/g) ?? []).length, 3);
    assert.doesNotMatch(await output('user', 'user_alice', 'user_alice', rows), /Club round robin/);
});
