# AGENTS.md - Intra Club Scaffold Development Guide

This repository is a reusable scaffold/template for future apps.

Today it intentionally contains **no domain-specific product logic** beyond basic user/account flows. Its purpose is to provide a stable implementation baseline for:

- a generic graph-style data model in Azure Table Storage
- a SvelteKit frontend that reads from a published `guids.json`
- an Azure Functions API that performs signed mutations
- optional OneSignal web push wiring

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
- **Key Vault**: stores OneSignal and other secrets
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
  - returns `ONESIGNAL_APP_ID` when configured
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
- [doSendPush.ts](./api/src/services/doSendPush.ts): OneSignal push dispatch

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
  - loads OneSignal SDK
  - reads app ID from `system/about`
  - links external user ID and requests permission on next gesture

### Reusable components (`app/src/lib/components/`)

- [apiService.svelte](./app/src/lib/components/apiService.svelte)
  - consistent action button + confirmation/execute UX
  - API call + `guids.refresh()` + optional redirect by `subject`
- [gencRouteLink.svelte](./app/src/lib/components/gencRouteLink.svelte)
  - standard route-list row UI
  - optional expandable "more options" mode
- [userLogin.svelte](./app/src/lib/components/userLogin.svelte)
  - otp/create/login entry flow
- [installApp.svelte](./app/src/lib/components/installApp.svelte)
  - browser/platform-specific install guidance text

### Current page scaffold

- root redirect: [app/src/routes/+page.svelte](./app/src/routes/+page.svelte)
- shared layout/init: [app/src/routes/+layout.svelte](./app/src/routes/+layout.svelte)
- login gate: [app/src/routes/login/+page.svelte](./app/src/routes/login/+page.svelte)
- browse/filter list: [app/src/routes/browse/+page.svelte](./app/src/routes/browse/+page.svelte)
- generic entity view: [app/src/routes/genc/[entity_id]/+page.svelte](./app/src/routes/genc/[entity_id]/+page.svelte)
- user view/edit: [app/src/routes/user/[user_id]/+page.svelte](./app/src/routes/user/[user_id]/+page.svelte), [app/src/routes/user/[user_id]/edit/+page.svelte](./app/src/routes/user/[user_id]/edit/+page.svelte)
- menu/about: [app/src/routes/menu/+page.svelte](./app/src/routes/menu/+page.svelte), [app/src/routes/about/+page.svelte](./app/src/routes/about/+page.svelte)

### Push-related static files

- [manifest.webmanifest](./app/static/manifest.webmanifest)
- [OneSignalSDKWorker.js](./app/static/OneSignalSDKWorker.js)
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
- Reuse `doSendPush` for notification fan-out when needed.

### Frontend

- Consume graph data from `guids` store helpers.
- Use `apiService.svelte` for mutation actions where possible.
- Use `gencRouteLink.svelte` for list-style navigation rows.
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
