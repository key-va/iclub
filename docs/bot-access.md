# Bot API access

Create a secret named `intra-club-bot-key` in the Key Vault used by each environment. The infrastructure template links the API's `INTRA_CLUB_BOT_KEY` setting to that secret using the existing managed identity. For `next`, the vault is `nextxkv`. Deployment does not generate or read the key value. Keep it in the vault and bot's private configuration, not frontend code or repository files.

If the secret is added/rotated after the reference has been deployed, refresh the Function App's Key Vault references or save its configuration to fetch the latest value.

Bot requests use the same top-level field names as normal API calls, but `signature` contains the exact shared key, rather than an ECDSA signature. Do not additionally sign or Base64-encode the key. `caller_id` must be a `bot_...` ID. No `device_id` is needed. Verification does not require an existing bot entity, so initial restore works against an empty database.

## Club creation

```json
{
  "caller_id": "bot_0000-00-00_00-00-00_bootstrap00b",
  "signature": "YOUR_BOT_KEY",
  "data": {
    "name": "Example Club",
    "url": "example.intra.club",
    "background": "#B67233",
    "foreground": "#00BFFF",
    "admin_user_id": "user_0000-00-00_00-00-00_bootstrap0uz",
    "image": "BASE64_512_BY_512_JPEG"
  }
}
```

See [club-create.md](./club-create.md) for all provisioning fields.

## Restore

The bootstrap row array goes inside `data`; the endpoint no longer accepts a raw unauthenticated array. For example, a bot can read the existing complete bootstrap file and construct the request:

```js
const rows = JSON.parse(await fs.readFile('shared/sample-data.json', 'utf8'));
const body = {
  caller_id: 'bot_0000-00-00_00-00-00_bootstrap00b',
  signature: process.env.INTRA_CLUB_BOT_KEY,
  data: rows
};
// POST JSON.stringify(body) to /api/system/restore over HTTPS.
```

Restore replaces the public graph with the supplied array, as before. Missing/invalid credentials and normal-user callers are rejected before any deletion. Do not place the key inside individual graph rows or club attributes.

## Other endpoints

- Existing authenticated mutations use the shared verifier: bot callers provide the key, while human callers retain device-based ECDSA signatures. Endpoint-specific role/ownership rules still apply; the bot key does not make a bot a member/admin of every entity.
- `user/push` requires a real user/device identity to associate browser subscriptions.
- `system/about` and `system/manifest` remain public; they do not return the bot key.
- OTP, login and signup remain public entry flows.
- Missing/empty/unresolved vault references disable bot access. `SYSTEM_BOT_SECRET` is no longer accepted. Credentials are compared without logging their values.
