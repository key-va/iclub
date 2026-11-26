import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker(clients = []) {
    const handlers = {}, shown = [], opened = [], messages = [], lifecycle = [];
    const self = {
        location: { origin: 'https://app.example' },
        skipWaiting: async () => lifecycle.push('install'),
        addEventListener: (type, handler) => handlers[type] = handler,
        registration: { showNotification: async (...args) => shown.push(args) },
        clients: { claim: async () => lifecycle.push('activate'), matchAll: async () => clients, openWindow: async url => opened.push(url) }
    };
    vm.runInNewContext(readFileSync(new URL('../static/service.js', import.meta.url), 'utf8'), { self, URL });
    const dispatch = async (type, event) => {
        let done;
        handlers[type]({ ...event, waitUntil: promise => done = promise });
        await done;
    };
    return { dispatch, shown, opened, messages, lifecycle };
}

test('worker displays push and tells open app windows to refresh', async () => {
    const messages = [];
    const w = worker([{ postMessage: m => messages.push(m) }]);
    await w.dispatch('push', { data: { json: () => ({ title: 'Challenge', body: 'Play now', tag: 'match_1', url: 'https://app.example/match/match_1' }) } });
    assert.equal(w.shown[0][0], 'Challenge');
    assert.equal(w.shown[0][1].body, 'Play now');
    assert.equal(w.shown[0][1].tag, 'match_1');
    assert.equal(messages[0].type, 'PUSH_RECEIVED');
});

test('empty or malformed push still displays a visible notification', async () => {
    const w = worker();
    await w.dispatch('push', { data: { json: () => { throw Error(); } } });
    assert.equal(w.shown[0][0], 'Intra Club');
});

test('notification click focuses and navigates an existing app window', async () => {
    const actions = [];
    const w = worker([{ url: 'https://app.example/browse', navigate: async url => actions.push(url), focus: async () => actions.push('focus') }]);
    await w.dispatch('notificationclick', { notification: { data: { url: 'https://app.example/match/match_1' }, close: () => actions.push('close') } });
    assert.deepEqual(actions, ['close', 'https://app.example/match/match_1', 'focus']);
    assert.equal(w.opened.length, 0);
});

test('notification click opens a new window and rejects off-origin navigation', async () => {
    const w = worker();
    await w.dispatch('notificationclick', { notification: { data: { url: 'https://other.example/' }, close() {} } });
    assert.equal(w.opened[0], 'https://app.example/');
});


test('worker activates immediately and takes control of open app windows', async () => {
    const w = worker();
    await w.dispatch('install', {});
    await w.dispatch('activate', {});
    assert.deepEqual(w.lifecycle, ['install', 'activate']);
});
