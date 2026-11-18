import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadGraph } from './loadGraph.mjs';

let graph;
before(async () => {
    // Browser build uses the real client reactivity implementation, unlike SSR's
    // no-op createSubscriber. No DOM is needed for these derived/effect probes.
    const result = await build({
        configFile: false, logLevel: 'error',
        plugins: [svelte({ configFile: false })],
        resolve: { alias: { '#lib': resolve('src/lib') } },
        define: { 'import.meta.env.VITE_PREFIX': JSON.stringify('iclub-test') },
        build: { write: false, minify: false,
            lib: { entry: resolve('test/fixtures/guidsReactive.svelte.ts'), formats: ['es'] } }
    });
    const output = Array.isArray(result) ? result[0] : result;
    const code = output.output.find(item => item.type === 'chunk' && item.isEntry).code;
    graph = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
});
after(() => graph?.guids.reset());
const fixture = () => [
    { pk: 'user', rk: 'user_test', name: 'Alice' },
    { pk: 'ladder', rk: 'ladder_test', name: 'Singles', rank: 100 },
    { pk: 'user_test', rk: 'ladder_test', rank: 3 },
    { pk: 'ladder_test', rk: 'user_test', rank: 3 },
    { pk: 'user_test', rk: 'team_missing', state: 'pending' }
];

test('ID-only lookups return distinct entity and raw mirrored relation rows', async () => {
    await loadGraph(graph.guids, fixture());
    assert.equal(graph.nameOf('user_test'), 'Alice');
    assert.equal(graph.nameOf('user_missing'), 'user_missing');
    assert.equal(graph.entityOf('user_missing'), undefined);
    assert.equal(graph.entityOf('ladder_test').rank, 100);
    assert.deepEqual(graph.relationsOf('user_test'), fixture().slice(2).filter(row => row.pk === 'user_test'));
    assert.deepEqual(graph.relationsOf('ladder_test'), [fixture()[3]]);
    assert.deepEqual(graph.relationsOf('user_missing'), []);
    assert.equal(graph.relationsOf('user_test')[0].relation, undefined);
    assert.equal(graph.relationsOf('user_test')[0].name, undefined);
});

test('ID-only lookups react to graph load, entity/relationship changes, removals and reset', async () => {
    graph.guids.reset();
    const probe = graph.watchGraph();
    const latest = () => probe.observations.at(-1);
    try {
        assert.deepEqual(latest(), { name: 'user_test', entityName: undefined, ladders: [] });
        const items = fixture();
        await loadGraph(graph.guids, items);
        probe.flush();
        assert.deepEqual(latest(), { name: 'Alice', entityName: 'Alice', ladders: [{ name: 'Singles', rank: 3 }] });
        const originalEntity = graph.entityOf('user_test');
        const count = probe.observations.length;
        await loadGraph(graph.guids, items);
        probe.flush();
        assert.equal(graph.entityOf('user_test'), originalEntity);
        assert.equal(probe.observations.length, count, 'unchanged graph must not rerun lookup consumers');
        items[0].name = 'Alicia';
        items[1].name = 'Updated ladder';
        items[2].rank = 1;
        await loadGraph(graph.guids, items);
        probe.flush();
        assert.deepEqual(latest(), { name: 'Alicia', entityName: 'Alicia', ladders: [{ name: 'Updated ladder', rank: 1 }] });
        await loadGraph(graph.guids, items.filter(row => row.pk !== 'user_test'));
        probe.flush();
        assert.deepEqual(latest().ladders, []);
        await loadGraph(graph.guids, []);
        probe.flush();
        assert.equal(latest().name, 'user_test');
        await loadGraph(graph.guids, fixture());
        probe.flush();
        graph.guids.reset();
        probe.flush();
        assert.deepEqual(latest(), { name: 'user_test', entityName: undefined, ladders: [] });
    } finally { probe.stop(); }
});

test('failed refresh keeps the visible graph and disposed consumers can be recreated', async () => {
    await loadGraph(graph.guids, fixture());
    const first = graph.watchGraph();
    const second = graph.watchGraph();
    try {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => new Response('unavailable', { status: 503 });
        try { await assert.rejects(graph.guids.refresh(), /503/); }
        finally { globalThis.fetch = originalFetch; }
        first.flush();
        assert.equal(first.observations.at(-1).name, 'Alice');
        first.stop();
        const items = fixture();
        items[0].name = 'Changed';
        await loadGraph(graph.guids, items);
        second.flush();
        assert.equal(second.observations.at(-1).name, 'Changed');
        const recreated = graph.watchGraph();
        try { assert.equal(recreated.observations.at(-1).name, 'Changed'); }
        finally { recreated.stop(); }
    } finally { first.stop(); second.stop(); }
});
