const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
const writes = [];
class TableClient {
    constructor(_endpoint, table) { this.table = table; }
    async getEntity(pk, rk) { return { partitionKey: pk, rowKey: rk, name: 'Original', is_admin: rk === 'user_admin' }; }
    async *listEntities() { }
    async deleteEntity(pk, rk) { writes.push([this.table, pk, rk]); }
}
Module._load = function(id, parent, main) {
    if (id === '@azure/functions') return { app: { http() {} } };
    if (id === '@azure/identity') return { DefaultAzureCredential: class {} };
    if (id === '@azure/data-tables') return { TableClient, odata: (parts, ...values) => parts.join('') + values.join('') };
    if (id.endsWith('/resourceNames')) return { resourceName: () => 'testxsa', resourceSuffix: { storageAccount: '' } };
    if (id.endsWith('/doSignatureVerification')) return { doSignatureVerification: async () => {} };
    for (const name of ['doGuidsToPublic','doUpsertEntity','doAssetToPublic','doAssetFromPublic'])
        if (id.endsWith('/' + name)) return { [name]: async (...args) => { writes.push([name, ...args]); } };
    return original.call(this, id, parent, main);
};
const { userDelete } = require('../dist/src/functions/userDelete');
const { ladderDelete } = require('../dist/src/functions/ladderDelete');
Module._load = original;
after(() => { Module._load = original; });
const request = (caller, params) => ({ params, url: 'https://example.test/api/delete',
    json: async () => ({ caller_id: caller, device_id: 'device_test', signature: 'mocked' }) });
const context = { log() {} };

test('successful deletion returns a real local destination while retaining cleanup behaviour', async () => {
    writes.length = 0;
    const user = await userDelete(request('user_self', { user_id: 'user_self' }), context);
    assert.equal(user.status, 200);
    assert.equal(user.jsonBody.subject, '/login');
    assert.equal(writes.find(row => row[0] === 'doUpsertEntity')[3].name, 'User Removed');
    const ladder = await ladderDelete(request('user_admin', { ladder_id: 'ladder_test' }), context);
    assert.equal(ladder.status, 200);
    assert.equal(ladder.jsonBody.subject, '/browse');
    assert.ok(writes.some(row => row[0] === 'guids' && row[1] === 'ladder' && row[2] === 'ladder_test'));
});

test('unauthorised deletions still reject without writes or navigation subjects', async () => {
    writes.length = 0;
    for (const result of [
        await userDelete(request('user_other', { user_id: 'user_self' }), context),
        await ladderDelete(request('user_other', { ladder_id: 'ladder_test' }), context)
    ]) {
        assert.equal(result.status, 403);
        assert.equal(result.jsonBody.subject, undefined);
    }
    assert.deepEqual(writes, []);
});
