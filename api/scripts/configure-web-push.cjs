// Run after Azure login. Provision through ARM; never read secret values on deploy.
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const webpush = require('web-push');
const prefix = process.env.RESOURCE_GROUP_PREFIX;
if (!prefix) throw Error('RESOURCE_GROUP_PREFIX is required');
const vault = `${prefix}xkv`;
const name = 'web-push-vapid-keys';
function az(args) {
    return spawnSync('az', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
}
const vaultInfo = az(['keyvault', 'show', '--resource-group', prefix, '--name', vault, '--query', 'id', '-o', 'tsv']);
if (vaultInfo.status !== 0) throw Error(`Cannot resolve Key Vault resource: ${vaultInfo.stderr}`);
const url = `https://management.azure.com${vaultInfo.stdout.trim()}/secrets/${name}?api-version=2024-11-01`;
// Explicit ARM URLs avoid CLI nested-resource name parsing. GET returns metadata only.
const existing = az(['rest', '--method', 'get', '--url', url, '--query', 'name', '-o', 'tsv']);
if (existing.status !== 0) {
    if (!/\b(ResourceNotFound|SecretNotFound|NotFound|Not Found)\b/.test(existing.stderr)) throw Error(`Cannot inspect Web Push secret metadata: ${existing.stderr}`);
    const directory = mkdtempSync(join(tmpdir(), 'web-push-'));
    try {
        const path = join(directory, 'properties.json');
        writeFileSync(path, JSON.stringify({ properties: { value: JSON.stringify(webpush.generateVAPIDKeys()) } }), { mode: 0o600 });
        const saved = az(['rest', '--method', 'put', '--url', url, '--body', `@${path}`, '--output', 'none']);
        if (saved.status !== 0) throw Error(`Cannot provision Web Push Key Vault secret: ${saved.stderr}`);
        console.log('Created Web Push key pair in Key Vault.');
    } finally { rmSync(directory, { recursive: true, force: true }); }
} else console.log('Reusing existing Web Push secret (value not read).');
const configured = az(['functionapp', 'config', 'appsettings', 'set', '--resource-group', prefix, '--name', `${prefix}xfa`, '--settings',
    `WEB_PUSH_VAPID_KEYS=@Microsoft.KeyVault(VaultName=${vault};SecretName=${name})`, '--output', 'none']);
if (configured.status !== 0) throw Error(`Cannot configure Web Push setting: ${configured.stderr}`);
console.log('Configured Function App Key Vault reference.');
