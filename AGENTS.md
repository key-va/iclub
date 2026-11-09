# AGENTS.md - Intra Club Scaffold Development Guide

This repository is a reusable scaffold/template for future apps.

Today it intentionally contains **no domain-specific product logic** beyond basic user/account flows. Its purpose is to provide a stable implementation baseline for:

- a generic graph-style data model in Azure Table Storage
- a SvelteKit frontend that reads from a published `guids.json`
- an Azure Functions API that performs signed mutations
- direct standards-based Web Push

Use this guide to keep future AI-driven feature development consistent with the existing architecture.

---

## 1) Architecture Snapshot (Current Implementation)

Primary resources and roles:

- **Azure Static Web App**: hosts the SvelteKit app
- **Azure Function App**: hosts the Node API
- **Azure Storage Account**:
  - `guids` table (public app graph data source)
  - `auths` table (private auth/device data)
  - `public` blob container (`guids.json`, profile images, public assets)
- **Key Vault**: stores the shared Web Push VAPID key pair and other secrets
- **App Insights + User Assigned Managed Identity**: telemetry and auth for Azure SDK access

Frontend data flow:

1. Load and periodically refresh `public/guids.json`
2. Render entities/relations reactively from store state
3. Send mutations to API endpoints
4. API republishes `guids.json`
5. Frontend refreshes from latest export

---

## 2) Data Model Contract (Keep As-Is)

The storage model is a generic property graph with two row shapes.

### Entity row

- `pk`: entity type (for example `user`, `team`, `event`)
- `rk`: globally unique ID in format `type_YYYY-MM-DD_HH-MM-SS_<hex>`
- `name`: display label (recommended)
- additional fields: entity attributes

### Relation row

- two mirrored rows are required:
  - row A: `pk = entityAId`, `rk = entityBId`
  - row B: `pk = entityBId`, `rk = entityAId`
- all non-key fields must match in both rows
- additional fields describe the relationship, not the entities

### Core invariants

1. Every entity has a stable type + ID.
2. Every relation is mirrored bidirectionally.
3. Entity attributes stay on entity rows.
4. Relation attributes stay on relation rows.
5. Business semantics live in API logic, not in storage schema.

---

## 3) Backend API (Azure Functions, Node/TypeScript)

Current endpoints in `api/src/functions/`:

- `system/about` ([systemAbout.ts](./api/src/functions/systemAbout.ts))
  - returns entity counts from `guids`
  - returns `WEB_PUSH_PUBLIC_KEY` when configured (never the private key)
- `system/restore` ([systemRestore.ts](./api/src/functions/systemRestore.ts))
  - replaces `guids` table from posted array, then republishes `guids.json`
- `user/otp` ([userOtp.ts](./api/src/functions/userOtp.ts))
  - checks if contact exists, sets placeholder OTP for existing users
- `user/login` ([userLogin.ts](./api/src/functions/userLogin.ts))
  - validates OTP + EC public key, registers device, returns `user_id` + `device_id`
- `user/create` ([userCreate.ts](./api/src/functions/userCreate.ts))
  - creates user entity/auth rows, registers first device, seeds avatar, republishes
- `user/{user_id}/update` ([userUpdate.ts](./api/src/functions/userUpdate.ts))
  - signature-verified self-update (name/email/phone/image), republishes, sends push
- `user/{user_id}/delete` ([userDelete.ts](./api/src/functions/userDelete.ts))
  - signature-verified self-delete flow (anonymise entity, purge auth, placeholder avatar, republish)
- `ladder/{ladder_id}/join` ([ladderJoin.ts](./api/src/functions/ladderJoin.ts))
  - active ladders only; the player becomes `state: "pending"` and the ladder admins are pushed
- `ladder/{ladder_id}/away` ([ladderAway.ts](./api/src/functions/ladderAway.ts))
  - a participant sets their own ladder `state` to `away`
- `match/create` ([matchCreate.ts](./api/src/functions/matchCreate.ts))
  - body `data`: `ladder_id`, `challenger_id`, `defender_id`; caller is the challenger or a ladder admin
  - validates states, rank and reach, creates a `pending` match named "challenger vs defender" (first names) with mirrored relations to the ladder and both players (`role`), sets both players `busy`, pushes the defender
- `match/{match_id}/accept` ([matchAccept.ts](./api/src/functions/matchAccept.ts))
  - the defender (or a ladder admin) moves a `pending` match to `active` and pushes the challenger; the acceptance deadline is not enforced yet
- `ladder/{ladder_id}/accept` ([ladderAccept.ts](./api/src/functions/ladderAccept.ts))
  - ladder admin accepts a pending player (`data.user_id`), who is added at the bottom rank and notified
  - `message/create` ([messageCreate.ts](./api/src/functions/messageCreate.ts))
    - any signed-in user posts `data.match_id` (any existing match, any state) and `data.text` (text/punctuation/emoji, max 500 chars); creates a `message` entity (`name` = text) related to the sender (`role: "sender"`) and the match; notifies the other players (heading = match name, content = `<sender name>: text`)
### Reusable services (use these first)

Located in `api/src/services/`:

- [doNewGuid.ts](./api/src/services/doNewGuid.ts): ID generation
- [doUpsertEntity.ts](./api/src/services/doUpsertEntity.ts): entity row upsert
- [doUpsertRelation.ts](./api/src/services/doUpsertRelation.ts): mirrored relation upsert
- [doUpsertAuth.ts](./api/src/services/doUpsertAuth.ts): auth table upsert
- [doSignatureVerification.ts](./api/src/services/doSignatureVerification.ts): request signature verification
- [doGuidsToPublic.ts](./api/src/services/doGuidsToPublic.ts): full table export to `public/guids.json`
- [doAssetToPublic.ts](./api/src/services/doAssetToPublic.ts): publish assets/images to `public`
- [doAssetFromPublic.ts](./api/src/services/doAssetFromPublic.ts): remove an asset/image from `public`
- [doSendPush.ts](./api/src/services/doSendPush.ts): direct Web Push dispatch from private device subscriptions
- [doCompleteMatch.ts](./api/src/services/doCompleteMatch.ts): finishes a match (result rows, ladder ranks/points/cooling, republish); does not notify, callers send their own push using the returned match name and player ids; shared by `match/{id}/complete`, `match/{id}/forfeit` and `batchHourly`
- [doPostMessage.ts](./api/src/services/doPostMessage.ts): records a `message` entity on a match, related to its sender (a user, or the bootstrap bot `botId` for automated messages); does not publish or notify; used by `message/create` and `batchHourly`
- [doFindDueMatches.ts](./api/src/services/doFindDueMatches.ts): pending/active matches whose cool/play-period deadline falls in a time window; used by `batchHourly` (forfeit overdue, warn 12 hours ahead)

### Endpoint development rules

When adding a new endpoint:

1. Validate request payload and required params.
2. Verify signature for authenticated actions (`doSignatureVerification`).
3. Read existing graph/auth state from storage.
4. Apply business rules inline in the endpoint.
5. Persist via existing helpers (`doUpsertEntity`, `doUpsertRelation`, `doUpsertAuth`).
6. Republish with `doGuidsToPublic` if public graph changes.
7. Return standard response shape:
   - `success: boolean`
   - `message: string`
   - optional `subject: string`
   - optional `data: object`

Do not introduce new storage abstractions unless a real gap is proven.

---

## 4) Frontend (SvelteKit + Svelte 5 runes)

### Core stores (`app/src/lib/stores/`)

- [guids.ts](./app/src/lib/stores/guids.ts)
  - stateful loader/refresher for `guids.json`
  - auto-refresh timer support
  - merge strategy to preserve object identity when unchanged
  - helpers: `entityOf`, `relationsOf`, `relatedEntities`, `entitiesOfType`, `nameOf`
- [local.ts](./app/src/lib/stores/local.ts)
  - persisted device-local auth context (`caller_id`, `device_id`, `connect_key`)
  - signature generation compatible with API verification
- [remote.ts](./app/src/lib/stores/remote.ts)
  - API caller (`callApi`) with signed/unsigned modes
  - keypair generation for login/create flow
- [push.ts](./app/src/lib/stores/push.ts)
  - starts only in installed app mode; registers `/service.js` and reads the public VAPID key from `system/about`
  - requests permission on the next gesture, saves browser subscriptions via signed `user/push`, and refreshes data on received push
- [installed.ts](./app/src/lib/stores/installed.ts)
  - shared reactive installed-window detection for push and install guidance

### Reusable components (`app/src/lib/components/`)

- [apiService.svelte](./app/src/lib/components/apiService.svelte)
  - consistent action button + confirmation/execute UX
  - API call + `guids.refresh()` + optional redirect by `subject`
- [routeLink.svelte](./app/src/lib/components/routeLink.svelte)
  - standard route-list row UI: tap follows `href`; an optional children snippet holds options revealed by a long press (also right-click or Shift+Enter) that revert after 9 seconds
  - shows a right arrow only when there is no image
- [hiddenOptions.svelte](./app/src/lib/components/hiddenOptions.svelte)
  - title/description row with no `href`; a chevron reveals hidden content (action buttons, help or process text)
  - `inline` swaps the content in for the title and reverts after 9 seconds; otherwise it opens below the row and stays until tapped again
  - with no children it is a plain information row (dash icon)
- [userLogin.svelte](./app/src/lib/components/userLogin.svelte)
  - otp/create/login entry flow
- [installApp.svelte](./app/src/lib/components/installApp.svelte)
  - browser/platform-specific install guidance below each page icon; hidden in installed app mode

### Current page scaffold

- root redirect: [app/src/routes/+page.svelte](./app/src/routes/+page.svelte)
- shared layout/init: [app/src/routes/+layout.svelte](./app/src/routes/+layout.svelte)
- browser and installed-app login: [app/src/routes/login/+page.svelte](./app/src/routes/login/+page.svelte)
- browse/filter list: [app/src/routes/browse/+page.svelte](./app/src/routes/browse/+page.svelte)
- generic entity view: [app/src/routes/genc/[entity_id]/+page.svelte](./app/src/routes/genc/[entity_id]/+page.svelte)
- user view/edit: [app/src/routes/user/[user_id]/+page.svelte](./app/src/routes/user/[user_id]/+page.svelte), [app/src/routes/user/[user_id]/edit/+page.svelte](./app/src/routes/user/[user_id]/edit/+page.svelte)
- menu/about: [app/src/routes/menu/+page.svelte](./app/src/routes/menu/+page.svelte), [app/src/routes/about/+page.svelte](./app/src/routes/about/+page.svelte)
- bot view: [app/src/routes/bot/[bot_id]/+page.svelte](./app/src/routes/bot/[bot_id]/+page.svelte) (avatar and a note that it is an automation account)

### Push-related static files

- [manifest.webmanifest](./app/static/manifest.webmanifest)
- [service.js](./app/static/service.js)

---

## 5) Template Intent for Future Apps

This repo should be used as a **starting template**:

1. Stand up scaffold/infrastructure
2. Keep shared mechanics stable (auth signatures, graph export, reusable UI/service helpers)
3. Add feature-specific endpoints/pages/components on top
4. Prefer extending existing helpers/components over creating parallel versions

The default assumption for AI workflows is:

- reuse existing helper/service/component first
- add a new primitive only when the existing one cannot cleanly support the feature
- keep new feature logic in endpoints/pages, not in duplicated infrastructure glue

---

## 6) Extension Rules for Agentic Feature Development

When implementing a new feature:

### Backend

- Start from an endpoint in `api/src/functions/`.
- Reuse `doSignatureVerification` for caller-authenticated actions.
- Use `doUpsertEntity`/`doUpsertRelation`/`doUpsertAuth` for persistence.
- Call `doGuidsToPublic` after any public graph mutation.
- Reuse `doAssetToPublic` for image/blob publishing.
- Reuse `doSendPush` for notification fan-out when needed; only endpoints and the batch job call it (services never notify).

### Frontend

- Consume graph data from `guids` store helpers.
- Use `apiService.svelte` for mutation actions where possible.
- Use `routeLink.svelte` for list-style navigation rows (rows with an `href`).
- Use `hiddenOptions.svelte` for rows without an `href` that hide options, help or status text.
- Link to entities with `hrefOf(id)` (`/<type>/<id>`) and `imageOf(id)` from the `guids` store; never link to `genc/...` from new code.
- Keep auth/session state in `local` store only.
- Keep API traffic through `callApi`.

### New helper/service/component policy

Add new shared primitives only if:

1. the need appears in multiple features, and
2. reuse of existing primitives would create brittle or duplicated code.

If added, document it in this file under the relevant section.

---

## 7) Current Non-Goals (Intentional)

- No domain-specific ladder/event/team business workflows yet
- No advanced role/permission system beyond current self-ownership checks
- No specialized analytics/reporting model beyond base telemetry

This is deliberate: the scaffold is meant to stay generic and composable for future app builds.

## Doubles ladders

- Users request membership individually. A ladder admin passes two pending `user_ids` to `ladder/{id}/accept`.
- Each acceptance creates a new ladder-specific `pair` entity (`ladder_id`) with permanent, equal `role: "member"` user relations. Existing pairs created before `ladder_id` was added resolve their ladder through the mirrored ladder relation.
- Pair/ladder relations carry competitive rank, points and state. User/ladder relations preserve admin flags and record pending/paired membership, not competitive state.
- `match/create` accepts pair IDs for doubles and user IDs for singles. Match/competitor relations carry challenger/defender roles and results. Doubles matches also link all four users with `role: "participant"` and `competitor_id` for personal history and score permissions.
- `doCompetitorUsers.ts` resolves a competitor to real users for authentication and notification fan-out. Used across match endpoints, completion, retirement, messaging and scheduled processing. It never sends push itself.
- Either partner can challenge, accept for the defending pair, or forfeit for their pair. All four users and ladder admins can submit scores. Unrelated authenticated users may message, but only match participants receive message notifications.
- `pair/{pair_id}/retire` allows a pair member or ladder admin to forfeit unresolved matches, retire the ladder relation, close ranking gaps and return both users to pending. Pair membership and historical matches remain intact; re-pairing creates a new entity.
- Global away status is excluded. The existing singles ladder-away endpoint rejects doubles requests.
- UI: ladder pairing/standings/challenges, pair detail/retirement at `/pair/{id}`, pair match scores and member history.
- Offline verification: `cd api && npm ci && npm test`; `cd app && npm ci && npm run check && npm test && npm run build`. API tests use in-memory TableClient and mocked signatures/export/push; no Azure storage, secrets or Web Push configuration is needed.
- Azure Table graph updates retain the existing sequential multi-row persistence model; there is no cross-partition transaction. Live concurrency and failure recovery need validation with configured Azure services.

## Direct Web Push

- `user/push` verifies the existing caller/device signature, then merges `origin`, `push_endpoint`, `push_p256dh`, and `push_auth` into the existing `auths` row (`pk=user_id`, `rk=device_id`). It never replaces `key` or creates public graph entities/relations. `subscription: null` clears the push binding.
- Registration removes previous bindings of the same endpoint, including across accounts. Logout unsubscribes and removes the binding before clearing local identity.
- `doSendPush` retains its user-ID interface and actor exclusion; it deduplicates endpoints, uses each device origin for links, and clears expired (404/410) subscriptions without deleting authentication keys. Sending remains best effort with no durable retry queue.
- `WEB_PUSH_VAPID_KEYS` is a JSON Key Vault secret containing `publicKey` and `privateKey`; `WEB_PUSH_SUBJECT` optionally overrides the default contact URL. Deployment runs `api/scripts/configure-web-push.cjs` to create the secret once and configure its environment-variable reference. Do not regenerate keys on ordinary deployments.
- `service.js` displays visible notifications and handles same-origin click navigation. No OneSignal SDK or provider credentials are used.
- See [docs/web-push.md](./docs/web-push.md) for configuration and device checks.

## Hostname branding

- Club entities use `url` as a hostname (no scheme/path), `background` for the page/former blue colour, and `foreground` for the action/former pink colour. Club icons are public `<club_id>.jpg` assets.
- `app/src/lib/stores/branding.ts` selects the current hostname's club from the public graph. CSS variables theme shared controls, page headings and generic app icons. Unknown hosts retain default app branding; entity photos and graph visibility are unchanged.
- `system/manifest?origin=<frontend origin>` returns a registered club's PWA manifest, name, colours and icon, with start URL/scope on that frontend origin. Unknown or malformed origins return 404.
- `doClubForOrigin` is shared by the manifest endpoint and push sender. Push branding uses each subscription's stored origin, never ladder context or membership. Missing branding falls back to the current static notification icon.
- Bootstrap source is `shared/sample-data.json`, with both directions of club-admin relations. Editing it does not restore or delete live storage data.

## Club provisioning

- `POST club/create` is bot-key authenticated. There is no Svelte creation form. Body is `{ caller_id: "bot_...", signature: "<bot key>", data: { name, url, foreground, background, admin_user_id, image, ...attributes } }`. Bots do not use ECDSA or need a device ID.
- `image` is raw Base64 or a JPEG data URL, exactly 512x512 and at most 2 MB. Sharp validates and resizes actual image data, including EXIF orientation.
- A new club GUID is generated. Club attributes are saved on its entity, and the existing admin user gets mirrored `{ is_admin: true }` relations. Input image/admin fields are not club attributes.
- Public assets: original `<club_id>.jpg`, plus `<club_id>_180.png`, `<club_id>_192.png`, `<club_id>_512.png`. The manifest uses explicit 192/512 PNG entries; the Apple touch icon uses the 180 PNG.
- Icons are uploaded before graph publication. Pre-publication failures attempt cleanup of only newly generated resources. An export failure returns 503 with `created: true` and the club ID so callers do not blindly recreate it.
- Existing clubs created through restore/manual uploads need equivalent PNG variants; this endpoint creates new clubs and does not migrate existing records/assets. DNS, domain binding and CORS remain manual.
- Request example and operational details: [docs/club-create.md](./docs/club-create.md).

## Default ladder image

- `ladder/create` uses a supplied `data.image` first. Otherwise it resolves the frontend `Origin` header through `doClubForOrigin` and copies that club's existing public `<club_id>.jpg` to the new `<ladder_id>.jpg`.
- `doAssetToPublic` accepts `{ publicName }` to copy an existing blob in the same public container, in addition to local asset names and uploaded buffers. No arbitrary remote URLs are fetched.
- Missing/unknown origins and missing club icon blobs retain the default local `icon-00.jpg` fallback. The submitted `data.club_id` relation is unchanged by image branding.

## Bot access

- API-only `INTRA_CLUB_BOT_KEY` references vault secret `intra-club-bot-key`. The owner creates the secret; deployment wires its reference and does not generate/read the value. The old `SYSTEM_BOT_SECRET` path is removed.
- `doBotVerification` (exported from `doSignatureVerification.ts`) requires a `bot_...` caller ID and the exact key in `signature`. Missing/unresolved configuration and wrong keys fail closed; comparison uses fixed-length SHA-256 digests and `timingSafeEqual`. Never log request credentials.
- `system/restore` and `club/create` require this bot authentication before validation/writes. Restore now accepts `{ caller_id, signature, data: [ ...rows ] }`; a raw unauthenticated array is no longer accepted. Bootstrap works with an empty graph because bot verification does not require a bot row to exist.
- Existing mutation endpoints accept bot keys through `doSignatureVerification` and allow bots to omit `device_id`; endpoint-specific role/ownership rules still apply. Human callers retain device-based ECDSA authentication. `user/push` remains a real-user/device endpoint.
- `system/about` and `system/manifest` remain public. OTP/login/signup remain public entry flows. No key is exposed to frontend configuration.
- Examples: [docs/bot-access.md](./docs/bot-access.md).
