import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
process.env.VITE_PREFIX = 'iclub-test';
let server, render, fixture;
before(async () => {
    server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error', optimizeDeps: { noDiscovery: true } });
    render = (await server.ssrLoadModule('svelte/server')).render;
    fixture = (await server.ssrLoadModule('/test/fixtures/RouteLinkHarness.svelte')).default;
});
after(async () => { await server?.close(); });

test('all route rows start as reveal buttons, preserving their visible details without a direct navigation link', () => {
    for (const withAction of [false, true]) {
        let called = false;
        const html = render(fixture, { props: { withAction, action: async () => {
            called = true;
            return { success: true, message: 'done' };
        } } }).body;
        assert.match(html, /<button[^>]*aria-label="show Sam Smith options"[^>]*aria-expanded="false"/);
        assert.match(html, /Sam Smith/);
        assert.match(html, /available/);
        assert.match(html, /aria-label="active"/);
        assert.match(html, /sam.jpg/);
        assert.doesNotMatch(html, /href="\/user\/user_sam"/);
        assert.doesNotMatch(html, /aria-label="challenge"/);
        assert.equal(called, false);
    }
});
