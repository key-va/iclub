import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_PREFIX = 'iclub-test';

test('blob help retries, shares one request, and renders feature and option paragraphs in create forms', async (t) => {
    const server = await createServer({
        plugins: [{
            name: 'open-form-help',
            enforce: 'pre',
            transform(source, id) {
                if (id.endsWith('/components/hiddenOptions.svelte')) {
                    return source.replace('let open = $state(false);', "let open = $state(title === 'Ladders');");
                }
                if (id.endsWith('/routes/ladder/create/+page.svelte') || id.endsWith('/routes/team/create/+page.svelte') ||
                    id.endsWith('/components/CompetitionCreate.svelte')) {
                    return source.replace('let showHelp = $state(false);', 'let showHelp = $state(true);');
                }
            }
        }],
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true }
    });
    t.after(() => server.close());

    const catalog = {
        'feature.ladder': 'Ladder introduction',
        'feature.about': 'About introduction',
        'feature.future.long': ['A topic with only long help'],
        'feature.ladder.long': ['Ladder paragraph one', 'Ladder paragraph two'],
        'feature.comp': 'Competition introduction',
        'feature.group': 'Group introduction',
        'feature.team': 'Team introduction',
        'settings.association': 'Association help',
        'settings.association.brta': 'BRTA help',
        'settings.format': 'Format help',
        'settings.format.singles': 'Singles help',
        'settings.format.doubles': 'Doubles help',
        'settings.match_format.best_of_three': 'Best of three help',
        'settings.match_format.best_of_three.long': ['Deciding set help']
    };
    let attempts = 0;
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url) => {
        assert.equal(url, 'https://iclub-testxsa.blob.core.windows.net/static/strings.json');
        return ++attempts === 1 ? new Response(null, { status: 503 }) : Response.json(catalog);
    });
    const { loadHelpStrings } = await server.ssrLoadModule('/src/lib/stores/helpStrings.ts');
    await loadHelpStrings();
    await Promise.all([loadHelpStrings(), loadHelpStrings()]);
    await loadHelpStrings();
    assert.equal(fetchMock.mock.callCount(), 2);

    const { render } = await server.ssrLoadModule('svelte/server');
    const Ladder = (await server.ssrLoadModule('/src/routes/ladder/create/+page.svelte')).default;
    const Competition = (await server.ssrLoadModule('/src/lib/components/CompetitionCreate.svelte')).default;
    const Team = (await server.ssrLoadModule('/src/routes/team/create/+page.svelte')).default;
    const context = new Map([['__request__', { page: { url: new URL('https://example.test/') } }]]);
    const ladder = render(Ladder, { context }).body;
    assert.match(ladder, /placeholder="ladder name"[\s\S]*Ladder introduction<\/p>[\s\S]*Ladder paragraph one<\/p>[\s\S]*Ladder paragraph two<\/p>[\s\S]*aria-label="format"[\s\S]*Format help[\s\S]*Singles help[\s\S]*Doubles help[\s\S]*Best of three help<\/p>[\s\S]*Deciding set help/);
    assert.match(render(Competition, { props: { type: 'comp' }, context }).body,
        /Competition introduction[\s\S]*Singles help[\s\S]*Doubles help/);
    assert.match(render(Competition, { props: { type: 'group' }, context }).body, /Group introduction/);
    assert.match(render(Team, { context }).body, /aria-label="Association"[\s\S]*Team introduction[\s\S]*Association help[\s\S]*BRTA help/);
    const About = (await server.ssrLoadModule('/src/routes/about/+page.svelte')).default;
    const about = render(About, { context }).body;
    assert.match(about, /Intra Club helps you manage and participate in ladders, competitions, teams and groups/);
    for (const title of ['Home', 'Users', 'Ladders', 'Comps', 'Teams', 'Groups', 'Rounds', 'Matches']) {
        assert.match(about, new RegExp(`aria-label="${title}" aria-expanded="${title === 'Ladders'}"`));
    }
    assert.match(about, /aria-expanded="true"[\s\S]*M18 6 6 18M6 6l12 12[\s\S]*Ladder introduction[\s\S]*Ladder paragraph one[\s\S]*Ladder paragraph two/);
    assert.match(about, /aria-expanded="false"[\s\S]*M9 9a3/);
    assert.equal((about.match(/class="group"/g) ?? []).length, 2);
    assert.doesNotMatch(about, /row-description|About introduction|A topic with only long help|Best of three help|Team introduction/);
});
