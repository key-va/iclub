// Run after Azure login. Reuses the existing vault secret; never rotate on deploy.
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
const existing = az(['keyvault', 'secret', 'show', '--vault-name', vault, '--name', name, '--query', 'value', '-o', 'tsv']);
if (existing.status !== 0) {
    if (!existing.stderr.includes('SecretNotFound')) throw Error(`Cannot access Web Push Key Vault secret: ${existing.stderr}`);
    const directory = mkdtempSync(join(tmpdir(), 'web-push-'));
    try {
        const path = join(directory, 'keys.json');
        writeFileSync(path, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
        const saved = az(['keyvault', 'secret', 'set', '--vault-name', vault, '--name', name, '--file', path, '--output', 'none']);
        if (saved.status !== 0) throw Error(`Cannot save Web Push Key Vault secret: ${saved.stderr}`);
        console.log('Created Web Push key pair in Key Vault.');
    } finally { rmSync(directory, { recursive: true, force: true }); }
} else {
    const keys = JSON.parse(existing.stdout);
    if (!keys.publicKey || !keys.privateKey) throw Error('Existing Web Push secret is invalid; refusing to replace it.');
    console.log('Reusing Web Push key pair in Key Vault.');
}
const configured = az(['functionapp', 'config', 'appsettings', 'set', '--resource-group', prefix, '--name', `${prefix}xfa`, '--settings',
    `WEB_PUSH_VAPID_KEYS=@Microsoft.KeyVault(VaultName=${vault};SecretName=${name})`, '--output', 'none']);
if (configured.status !== 0) throw Error(`Cannot configure Web Push setting: ${configured.stderr}`);
console.log('Configured Function App Key Vault reference.');
