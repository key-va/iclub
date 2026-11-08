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
const resource = ['--resource-group', prefix, '--resource-type', 'Microsoft.KeyVault/vaults/secrets', '--name', `${vault}/${name}`, '--api-version', '2024-11-01'];
function az(args) {
    return spawnSync('az', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
}
// ARM GET returns metadata, not the stored secret value. Existing keys stay untouched.
const existing = az(['resource', 'show', ...resource, '--query', 'name', '-o', 'tsv']);
if (existing.status !== 0) {
    if (!/\b(ResourceNotFound|SecretNotFound|NotFound)\b/.test(existing.stderr)) throw Error(`Cannot inspect Web Push secret metadata: ${existing.stderr}`);
    const directory = mkdtempSync(join(tmpdir(), 'web-push-'));
    try {
        const path = join(directory, 'properties.json');
        writeFileSync(path, JSON.stringify({ value: JSON.stringify(webpush.generateVAPIDKeys()) }), { mode: 0o600 });
        const saved = az(['resource', 'create', ...resource, '--properties', `@${path}`, '--output', 'none']);
        if (saved.status !== 0) throw Error(`Cannot provision Web Push Key Vault secret: ${saved.stderr}`);
        console.log('Created Web Push key pair in Key Vault.');
    } finally { rmSync(directory, { recursive: true, force: true }); }
} else console.log('Reusing existing Web Push secret (value not read).');
const configured = az(['functionapp', 'config', 'appsettings', 'set', '--resource-group', prefix, '--name', `${prefix}xfa`, '--settings',
    `WEB_PUSH_VAPID_KEYS=@Microsoft.KeyVault(VaultName=${vault};SecretName=${name})`, '--output', 'none']);
if (configured.status !== 0) throw Error(`Cannot configure Web Push setting: ${configured.stderr}`);
console.log('Configured Function App Key Vault reference.');
