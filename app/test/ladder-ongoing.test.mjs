import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_PREFIX = 'iclub-test';

let server, page, guids, local, render;
const originalFetch = globalThis.fetch;

before(async () => {
    server = await createServer({
        plugins: [{
            name: 'expand-hidden-options-for-test',
            enforce: 'pre',
            transform(source, id) {
                if (!id.replaceAll('\\', '/').endsWith('/src/lib/components/hiddenOptions.svelte')) return;
                return `<script>let { title, children } = $props();</script>
                    <section aria-label={title}><h2>{title}</h2>{@render children?.()}</section>`;
            }
        }],
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true }
    });
    render = (await server.ssrLoadModule('svelte/server')).render;
    page = (await server.ssrLoadModule('/src/routes/ladder/[ladder_id]/+page.svelte')).default;
    guids = (await server.ssrLoadModule('/src/lib/stores/guids.ts')).guids;
    local = await server.ssrLoadModule('/src/lib/stores/local.ts');
});

after(async () => {
    globalThis.fetch = originalFetch;
    await server?.close();
});

async function renderLadder(format, matches) {
    const items = [
        { pk: 'ladder', rk: 'ladder_test', name: 'Test ladder', format, state: 'active' },
        ...matches.flatMap(({ id, name, state, ladder = 'ladder_test', mine = false }) => [
            { pk: 'match', rk: id, name, state },
            { pk: ladder, rk: id },
            ...(mine ? [{ pk: id, rk: 'user_me' }, { pk: 'user', rk: 'user_me', name: 'Me' }] : [])
        ])
    ];
    globalThis.fetch = async () => new Response(JSON.stringify(items));
    await guids.load('https://example.test/guids.json');
    local.set_local_data({ caller_id: 'user_me', device_id: null, connect_key: null });
    return render(page, {
        context: new Map([['__request__', { page: { params: { ladder_id: 'ladder_test' } } }]])
    }).body;
}

test('ongoing section includes all pending and active ladder matches, but not other matches', async () => {
    for (const format of ['singles', 'doubles']) {
        const html = await renderLadder(format, [
            { id: 'match_pending', name: 'Pending players', state: 'pending', mine: true },
            { id: 'match_active', name: 'Other players', state: 'active' },
            { id: 'match_complete', name: 'Finished players', state: 'complete' },
            { id: 'match_other', name: 'Another ladder', state: 'pending', ladder: 'ladder_other' }
        ]);
        const ongoing = html.match(/<section aria-label="Ongoing Matches">[\s\S]*?<\/section>/)?.[0];
        assert.ok(ongoing);
        assert.match(ongoing, /href="\/match\/match_pending"[\s\S]*?Pending players[\s\S]*?pending match/);
        assert.match(ongoing, /href="\/match\/match_active"[\s\S]*?Other players[\s\S]*?active match/);
        assert.doesNotMatch(ongoing, /Finished players|Another ladder/);
        assert.ok(html.indexOf('Ongoing Matches') < html.indexOf('Match History'));
        assert.match(html.slice(0, html.indexOf('Ongoing Matches')), /Pending players/);
    }
});

test('ongoing section stays empty when no matches are pending or active', async () => {
    const html = await renderLadder('singles', [
        { id: 'match_complete', name: 'Finished players', state: 'complete' }
    ]);
    const ongoing = html.match(/<section aria-label="Ongoing Matches">[\s\S]*?<\/section>/)?.[0];
    assert.ok(ongoing);
    assert.doesNotMatch(ongoing, /href="\/match\//);
});
