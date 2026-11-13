import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('revealed options stay busy until every action or error dialog finishes', async () => {
    const source = await readFile(new URL('../src/lib/components/actionActivity.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const { trackActions } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    let listener;
    const node = {
        addEventListener(_type, callback) { listener = callback; },
        removeEventListener(_type, callback) {
            if (listener === callback) listener = undefined;
        },
    };
    const counts = [];
    const action = trackActions(node, (count) => counts.push(count));
    const first = new EventTarget();
    const second = new EventTarget();
    const send = (target, detail) => {
        const event = new CustomEvent('api-action-state', { detail });
        Object.defineProperty(event, 'target', { value: target });
        listener?.(event);
    };
    send(first, true);
    send(first, true);
    send(second, true);
    send(first, false);
    send(second, 'invalid');
    send(second, false);
    assert.deepEqual(counts, [1, 1, 2, 1, 0]);
    action.destroy();
    send(first, true);
    assert.deepEqual(counts, [1, 1, 2, 1, 0]);
});
