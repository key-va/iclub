import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
process.env.VITE_PREFIX = 'iclub-test';
let server, render, fixture;
before(async () => {
    server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error', optimizeDeps: { noDiscovery: true } });
    render = (await server.ssrLoadModule('svelte/server')).render;
    fixture = (await server.ssrLoadModule('/test/fixtures/HiddenActionHarness.svelte')).default;
});
after(async () => { await server?.close(); });

test('quick-action rows separate the coloured reveal button from icon navigation', () => {
    for (const colour of ['green', 'gold', 'blue', 'orange', 'red', 'grey']) {
        const html = render(fixture, { props: { colour } }).body;
        assert.match(html, /<button[^>]*aria-label="Actions for Sam Smith"[^>]*aria-expanded="false"/);
        assert.match(html, new RegExp(`background: ${colour}`));
        assert.match(html, /<a[^>]*href="\/user\/user_sam"[^>]*aria-label="Open Sam Smith"/);
        assert.match(html, /<strong>Sam Smith<\/strong>/);
        assert.match(html, /available/);
        assert.doesNotMatch(html, /aria-label="challenge"/);
        assert.doesNotMatch(html, /aria-label="Close actions for Sam Smith"/);
    }
});

test('rows without actions fall back to the standard navigation link with no reveal control', () => {
    const html = render(fixture, { props: { withAction: false } }).body;
    assert.match(html, /<a[^>]*href="\/user\/user_sam"/);
    assert.match(html, /Sam Smith/);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /Actions for Sam Smith/);
});
