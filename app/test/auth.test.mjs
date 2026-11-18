import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { get } from 'svelte/store';

let server, auth, local;
const previousStorage = globalThis.localStorage;
const stored = new Map([['local', JSON.stringify({ caller_id: 'user_existing', device_id: 'device_existing', connect_key: 'existing-key' })]]);
before(async () => {
    globalThis.localStorage = {
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value)
    };
    server = await createServer({
        configFile: false, cacheDir: '/tmp/iclub-auth-test-cache',
        resolve: { alias: { '#lib': process.cwd() + '/src/lib' } },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        logLevel: 'error', optimizeDeps: { noDiscovery: true },
        plugins: [{ name: 'auth-test-environment', enforce: 'pre',
            resolveId(id) {
                if (id === '$app/env') return '\0auth-test-env';
                if (id === '#lib/stores/push.ts' || id.endsWith('/src/lib/stores/push.ts')) return '\0auth-test-push';
            },
            load(id) {
                if (id === '\0auth-test-env') return 'export const browser = true;';
                if (id === '\0auth-test-push') return 'export const disconnectPush = () => globalThis.__authTestDisconnectPush();';
            }
        }]
    });
    auth = await server.ssrLoadModule('/src/lib/stores/auth.ts');
    local = await server.ssrLoadModule('/src/lib/stores/local.ts');
});
after(async () => {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    delete globalThis.__authTestDisconnectPush;
    await server?.close();
});

test('existing saved identities load unchanged and session establishment persists on the same storage key', () => {
    assert.equal(get(local.local).caller_id, 'user_existing');
    const identity = { caller_id: 'user_new', device_id: 'device_new', connect_key: 'new-key' };
    auth.setSession(identity);
    assert.deepEqual(get(local.local), identity);
    assert.deepEqual(JSON.parse(stored.get('local')), identity);
});

test('P-256 signatures verify against the API caller/device/path contract and retain one identity snapshot', async () => {
    const keys = await auth.generateKeyPair();
    auth.setSession({ caller_id: 'user_signer', device_id: 'device_signer', connect_key: keys.privateKey });
    const pending = auth.signRequest('/api/match/match_test/complete?ignored=true');
    auth.setSession({ caller_id: 'user_other', device_id: 'device_other', connect_key: null });
    const signed = await pending;
    assert.equal(signed.caller_id, 'user_signer');
    assert.equal(signed.device_id, 'device_signer');
    const publicKey = await crypto.subtle.importKey('spki', Buffer.from(keys.publicKey, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const verify = path => crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(signed.signature, 'base64'), new TextEncoder().encode(JSON.stringify(['user_signer', 'device_signer', path])));
    assert.equal(await verify('/api/match/match_test/complete'), true);
    assert.equal(await verify('/api/match/match_other/complete'), false);
});

test('incomplete identities cannot sign authenticated requests', async () => {
    for (const identity of [
        { caller_id: null, device_id: 'device', connect_key: 'key' },
        { caller_id: 'user', device_id: null, connect_key: 'key' },
        { caller_id: 'user', device_id: 'device', connect_key: null }
    ]) {
        auth.setSession(identity);
        await assert.rejects(auth.signRequest('/api/user/push'), /log in first/);
    }
});

test('session cleanup removes push while signed identity exists, then clears persisted identity even on failure', async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
        for (const fails of [false, true]) {
            auth.setSession({ caller_id: 'user_logout', device_id: 'device_logout', connect_key: 'key' });
            let disconnected = false;
            globalThis.__authTestDisconnectPush = () => {
                assert.equal(get(local.local).caller_id, 'user_logout');
                disconnected = true;
                if (fails) throw new Error('offline');
            };
            await auth.clearSession();
            assert.equal(disconnected, true);
            const empty = { caller_id: null, device_id: null, connect_key: null };
            assert.deepEqual(get(local.local), empty);
            assert.deepEqual(JSON.parse(stored.get('local')), empty);
        }
    } finally { console.error = originalError; }
});
