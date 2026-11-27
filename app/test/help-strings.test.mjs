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
        'feature.ladder.long': ['Ladder paragraph one', 'Ladder paragraph two', 'Red: player is away', 'Green: player can play', 'A green dot means active'],
        'feature.comp': 'Competition introduction',
        'feature.group': 'Group introduction',
        'feature.team': 'Team introduction',
        'feature.team.long': ['More about teams'],
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
    const ladder = render(Ladder, { context }).body.replace(/<!--.*?-->/g, "");
    assert.match(ladder, /placeholder="ladder name"[\s\S]*Ladder introduction<\/p>[\s\S]*Ladder paragraph one<\/p>[\s\S]*Ladder paragraph two<\/p>[\s\S]*aria-label="format"[\s\S]*Format help[\s\S]*Singles help[\s\S]*Doubles help[\s\S]*Best of three help<\/p>[\s\S]*Deciding set help/);
    assert.match(render(Competition, { props: { type: 'comp' }, context }).body,
        /Competition introduction[\s\S]*Singles help[\s\S]*Doubles help/);
    assert.match(render(Competition, { props: { type: 'group' }, context }).body, /Group introduction/);
    assert.match(render(Team, { context }).body, /aria-label="Association"[\s\S]*Team introduction[\s\S]*Association help[\s\S]*BRTA help/);
    const About = (await server.ssrLoadModule('/src/routes/about/+page.svelte')).default;
    const about = render(About, { context }).body.replace(/<!--.*?-->/g, "");
    assert.match(about, /Intra Club helps you manage and participate in ladders, competitions, teams and groups/);
    assert.match(about, /<strong>Ladders<\/strong><\/p>[\s\S]*?aria-label="Ladders" aria-expanded="true"[\s\S]*?M18 6 6 18M6 6l12 12[\s\S]*?<\/button><\/div>\s*<p[^>]*>Ladder introduction<\/p>[\s\S]*?Ladder paragraph one[\s\S]*?Ladder paragraph two/);
    for (const html of [ladder, about]) {
        assert.match(html, /role="img" aria-label="Red" style="background: red;"><\/span>[\s\S]*?player is away/);
        assert.match(html, /player is away\s*<br\/>\s*<span[^>]*aria-label="Green"[^>]*><\/span>player can play\s*<\/p>/);
        assert.doesNotMatch(html, /Red: player is away|Green: player can play/);
        assert.match(html, /A green dot means active/);
    }
    assert.equal((about.match(/Ladder introduction/g) ?? []).length, 1);
    assert.match(about, /<strong>Teams<\/strong><\/p>[\s\S]*?aria-label="Teams" aria-expanded="false"[\s\S]*?M9 9a3[\s\S]*?<\/button><\/div>\s*<p[^>]*>Team introduction<\/p>/);
    assert.doesNotMatch(about, /aria-label="Groups"|More about teams|About introduction|A topic with only long help|Best of three help/);
    assert.equal((about.match(/class="group"/g) ?? []).length, 2);
});
