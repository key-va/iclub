import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('revealed options stay busy until every action or error dialog finishes', async () => {
    const source = await readFile(new URL('../src/lib/components/actionActivity.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const { trackActions } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const listeners = new Map();
    const node = {
        addEventListener(type, callback) { listeners.set(type, callback); },
        removeEventListener(type, callback) {
            if (listeners.get(type) === callback) listeners.delete(type);
        },
    };
    const counts = [];
    const action = trackActions(node, (count) => counts.push(count));
    const first = new EventTarget();
    const second = new EventTarget();
    const send = (target, detail, type = 'api-action-state') => {
        const event = new CustomEvent(type, { detail });
        Object.defineProperty(event, 'target', { value: target });
        listeners.get(type)?.(event);
    };
    send(first, true);
    send(first, true);
    send(second, true);
    send(first, false);
    send(second, 'invalid');
    send(second, false);
    assert.deepEqual(counts, [1, 1, 2, 1, 0]);
    const busyCounts = [];
    const busy = trackActions(node, (count) => busyCounts.push(count), 'api-action-busy');
    send(first, true);
    send(first, true, 'api-action-busy');
    send(first, false, 'api-action-busy');
    assert.equal(counts.at(-1), 1);
    assert.deepEqual(busyCounts, [1, 0]);
    send(first, false);
    busy.destroy();
    send(first, true, 'api-action-busy');
    assert.deepEqual(busyCounts, [1, 0]);
    action.destroy();
    send(first, true);
    assert.deepEqual(counts, [1, 1, 2, 1, 0, 1, 0]);
});
