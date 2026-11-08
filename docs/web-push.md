# Direct Web Push

The app uses the browser Push API and the backend `web-push` library. Notifications are enabled only in installed app mode, after login and a user gesture. No Apple Developer account, APNs certificate, Firebase project or OneSignal account is required for web push.

## Configuration

One shared VAPID key pair is stored as a JSON secret `web-push-vapid-keys` in the existing `<prefix>xkv` vault. Its shape is `{"publicKey":"...","privateKey":"..."}`. The Function App setting `WEB_PUSH_VAPID_KEYS` references that secret. Only the public key is returned by `system/about`.

The API deployment workflow runs `api/scripts/configure-web-push.cjs` after Azure login. It creates the pair only if the secret is absent and configures the Function App setting. It checks secret metadata and provisions a missing secret through Azure Resource Manager; it never reads existing secret values. Its deployment identity needs control-plane permission to inspect/create that secret resource and update Function App settings. The Function App's existing managed identity needs Key Vault Secrets User access, as provisioned in Bicep. Configuration errors fail the deployment step instead of silently generating replacement credentials.

For manual setup, after `az login`, run `RESOURCE_GROUP_PREFIX=next node api/scripts/configure-web-push.cjs` with API dependencies installed. The script does not print secret values. An optional `WEB_PUSH_SUBJECT` setting can supply a `mailto:` or public `https:` contact identifier; the default is `https://app.intra.club`.

Retain this key pair. Changing it requires browsers to create new subscriptions. Existing OneSignal settings/secrets are unused; there is no migration of subscriptions or users.

## Private data

Subscription registration merges these attributes into the existing `auths` user/device row:

- `origin`: the frontend request Origin.
- `push_endpoint`: browser push-service endpoint.
- `push_p256dh`, `push_auth`: encryption material from the browser subscription.

The signature-verification `key` remains intact. No data is added to `guids` or its public export. The browser registers using signed `user/push`; sending resolves subscriptions from the recipients' user partitions. The same endpoint is rebound on a later login to prevent duplicate or previous-account delivery. Account deletion already removes all rows in the user's auth partition.

## Behaviour and limits

Notifications preserve headings, contents, actor exclusion, match links and grouping via notification tags. Links open the origin where the browser subscribed. Open app windows refresh their graph snapshot on receipt. The worker displays notifications and focuses/navigates an existing app window, or opens one.

Expired subscriptions (404/410) have their push fields cleared, preserving the device's authentication key. Temporary failures are logged without failing the application action. There is no durable retry queue, matching the previous best-effort sender; the push service can retain accepted messages for up to the requested 24-hour TTL. Acceptance is not proof that a person saw a notification.

Browser push endpoints are restricted to supported Google, Apple, Mozilla and Windows push-service hosts. Logout unsubscribes before clearing the stored identity, then clears the backend push binding. Normal browser mode does not register or prompt.

## Verification

Run `npm test` in `api`, and `npm run check`, `npm test`, and `VITE_PREFIX=next npm run build` in `app`. Tests cover signed registration, authentication-key preservation, endpoint validation, rebinding, recipient fan-out, actual payload encryption/VAPID request generation, expiry handling and service-worker display/click behaviour.

On physical devices, use two test accounts: install and log in on iOS/iPadOS 16.4+ and Android, grant notification permission, then trigger a challenge/message from the other account. Check delivery with the app closed, the click destination, actor exclusion, logout and login as another account. iOS requires the app to be opened from its Home Screen icon; Android also follows this app's installed-mode gate. Automated Chromium tests do not establish physical iOS/Android delivery.

Manifest endpoints, extra domains, club branding and icons are outside this change.
