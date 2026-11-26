# AGENTS.md - Intra Club Scaffold Development Guide

Use `next` as the default target for merging iClub code changes unless the user specifies another branch.

This repository is a reusable scaffold/template for future apps.

The app implements ladders, doubles pairs, matches, teams, rounds and groups on a shared implementation baseline:

- a generic graph-style data model in Azure Table Storage
- a SvelteKit frontend that reads from a published `guids.json`
- an Azure Functions API that performs signed mutations
- direct standards-based Web Push

Use this guide to keep future AI-driven feature development consistent with the existing architecture.

---

## 1) Architecture Snapshot (Current Implementation)

Primary resources and roles:

- **Azure Static Web App (Standard)**: hosts the SvelteKit app
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

Comp, group and team actions register explicit routes in separate action files, following the ladder handlers. Team and round role aliases share their action handler. Team request handling and locking live in `api/src/services/teamActions.ts`. Shared comp logic lives in `api/src/services/compActions.ts`. Group and comp creation and approval share `api/src/services/clubEntityRequests.ts`.

Current endpoints in `api/src/functions/`:

- `system/about` ([systemAbout.ts](./api/src/functions/systemAbout.ts))
  - returns entity counts from `guids`
  - returns `version` (`261125`) for the app footer, entity counts and `WEB_PUSH_PUBLIC_KEY` when configured (never private keys)
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
  - validates states, rank and reach, creates a `pending` match named "challenger vs defender" (full player names for singles; pair names for doubles) with mirrored relations to the ladder and both competitors (`role`), sets both competitors `busy`, pushes the defender
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
  - ID-only reactive helpers: `entityOf(id)`, `nameOf(id)`, `relationsOf(id)`; none accepts an items argument
  - `relationsOf(id)` returns raw outgoing relation rows, including unresolved links. Filter by `typeOf(row.rk)`; resolve entity names/attributes separately. Never merge entity and relationship attributes or attach `.relation`.
  - `relatedEntities` and `entitiesOfType` were removed. Filter the `entities` store for all entities of a type.
  - lookups use Svelte `createSubscriber` to track graph changes inside `$derived`, effects and templates even without `$guids.items`. Ordinary imperative reads return snapshots. Unchanged refreshes retain graph identity and do not invalidate lookup consumers.
- [local.ts](./app/src/lib/stores/local.ts)
  - persisted device-local auth context (`caller_id`, `device_id`, `connect_key`)
  - persistence only; retains the existing `local` storage key and identity fields; `setLocalData` / `clearLocalData` replace state atomically
- [auth.ts](./app/src/lib/stores/auth.ts)
  - key generation (`generateKeyPair`), session establishment (`setSession`), session cleanup (`clearSession`) and request signing (`signRequest`)
  - `signRequest` returns caller/device/signature from one identity snapshot, compatible with API verification
  - cleanup disconnects push while identity is available, then clears local state even if push cleanup fails; navigation stays with the caller
- [remote.ts](./app/src/lib/stores/remote.ts)
  - API caller (`callApi`) with signed/unsigned modes
  - named endpoint functions, payloads, signed/unsigned transport, graph refresh and recovery; delegates signing to `auth.ts`
- [push.ts](./app/src/lib/stores/push.ts)
  - starts only in installed app mode; registers `/service.js` and reads the public VAPID key from `system/about`
  - requests permission on the next gesture, saves browser subscriptions via signed `user/push`, and refreshes data on received push
- [installed.ts](./app/src/lib/stores/installed.ts)
  - shared reactive installed-window detection for push and install guidance

### Reusable components (`app/src/lib/components/`)

- Ladder components live together under `ladders/`:
  - `LadderUser.svelte` and `LadderPair.svelte` present singles/doubles standings and challenge controls. The ladder page gathers/sorts participants and chooses by ladder format.
  - `UserLadder.svelte` owns a user's ladder section, including relevant live matches, standing, and challenge/accept controls.
  - `LadderRequests.svelte` owns pending applicants and doubles partner selection/reset after acceptance or graph refresh.
  - `ladderRules.ts` replaces the former root-level `challenge.ts`. It shares challenge eligibility/reach, ladder state colours, and `ladderMembership(ladder, userId)`. Membership/admin flags remain on user-ladder relations; doubles competitive state/rank comes from the active pair-ladder relation. The pair page also uses this resolver. `pair` and competitive `relation` are raw relationship rows.
  - Contextual names put the page entity first and displayed entity second. Pass entities as props; components do not read route parameters. Local calculations/state stay inside components; shared ladder calculations stay alongside them.
  - Authentication behaviour lives in `auth.ts`, with identity persisted by `local.ts`. Ladder-page approval/join use `ActionConfirmation`; pending acceptance/pairing and singles/doubles standings challenges use `ActionQuick` with named functions from `remote.ts`. All contextual views use the same action components. Backend permissions and graph storage remain unchanged.
- Other contextual sections follow the same page-first naming convention:
  - `teams/UserTeam`, `TeamUser`, `TeamRound`, `TeamSummary`; `groups/UserGroup`, `GroupUser`, `GroupSummary`; `rounds/UserRound`, `RoundUser`, `RoundSummary`; `matches/MatchContest`, `MatchHistory`; `pairs/PairLadder`.
  - Pages gather route entities and related rows, then compose these sections. Components receive entities/raw relations and own display calculations, permission visibility and local interaction state.
  - Shared feature helpers are colocated: `rounds/roundRules.ts`, `matches/matchRules.ts`, `ladders/ladderSettings.ts`. These replace root-level `rounds.ts`, `matchSummary.ts`, `strings.ts`; do not add forwarding modules.
  - `messages/MessageThread.svelte` shares message sorting, sender resolution, validation and posting for matches, rounds and groups. `images/prepareSquareImage.ts` shares square JPEG preparation for creation/edit forms.
  - Named remote functions cover each endpoint used by the UI, including public OTP/login, team discovery, system info and push registration. Mutations refresh the graph; confirmation functions validate response subjects. Group/team join return their entity ID, ladder deletion returns `/browse`, and user deletion returns `/login`. User deletion clears the local session before response-driven navigation.
- Frontend test files run serially (`--test-concurrency=1`) because their Vite SSR servers share the dependency cache; concurrent pre-bundling caused `ERR_OUTDATED_OPTIMIZED_DEP` in CI.

- [EntityHeader.svelte](./app/src/lib/components/EntityHeader.svelte)
  - shared page title/subtitle, large image and install guidance; pages retain their outer container and entity-existence checks
  - uses the entity name and type whenever an entity is supplied. Branded pages and creation forms without an entity supply a title and subtitle. Related-entity images can override `imageOf(rk)`.
  - `image={null}` omits the image and install guidance; form previews remain reactive through the image prop

- [CompetitionCreate.svelte](./app/src/lib/components/CompetitionCreate.svelte)
  - shared group and elimination creation form, including image preparation and club-origin checks
- [ActionConfirmation.svelte](./app/src/lib/components/ActionConfirmation.svelte)
  - accepts a deferred `action` callback returning `NavigationResponse`, confirms before execution, then always navigates using the API response subject on success (an entity ID or validated local path); no destination/endpoint/data props
- [ActionQuick.svelte](./app/src/lib/components/ActionQuick.svelte)
  - executes its deferred `action` callback immediately, displays a timer while busy and never navigates, even if the response has a subject
  - both public action components share `ActionControl.svelte` internally for confirmation/error UI, duplicate-submission guards and `api-action-state` events used by revealed options
  - shared display props include name/disabled/inline/arrow/children/onsuccess and an optional accessible label. Immediate actions may override the default blue tone with green or orange.
  - named functions in `remote.ts` own payloads, signed HTTP requests and graph refresh: `activateLadder`, `joinLadder`, `acceptLadderMember`, `acceptLadderPair`, `createMatch`
  - successful mutations whose graph refresh fails expose a refresh-only retry; callback/navigation retries also retain the completed response to avoid repeating mutations
- [actionActivity.ts](./app/src/lib/components/actionActivity.ts)
  - keeps revealed options open while an API action or its error/confirmation dialog is active
- [routeLink.svelte](./app/src/lib/components/routeLink.svelte)
  - standard navigation-only row: tapping the row follows `href`. Supports title, description, image and optional detail. No action children, long-press handling, reveal state or timeout.
  - shows a right arrow only when there is no image
- [RouteLinkHiddenAction.svelte](./app/src/lib/components/RouteLinkHiddenAction.svelte)
  - quick-action row: title/description/detail are informational, a coloured dot button reveals action children, and only the image/arrow icon navigates
  - accepts `colour`; ladder standings use `ladderStateColours`, team/round rows use `roundRoleColour`, and pending applicants use orange (green for the selected doubles partner)
  - the visible dot is 24px with a 44px touch target, placed between the text and image. Remove duplicate status dots from detail snippets in these rows.
  - revealing replaces title/description/dot with actions and the image with an X. No timeout or long-press behaviour; X or Escape closes, with focus returned to the dot. Busy actions and error/confirmation screens disable closing via `trackActions`.
  - if action children are unavailable, falls back to ordinary `RouteLink`. All former action-bearing RouteLinks (ladder challenges/pairing, group/team acceptance, round selection and team availability) use this component.
  - migrated group/team/round controls use `ActionQuick` and named `remote.ts` calls (`acceptGroupMember`, `acceptTeamMember`, `setRoundRole`). Quick responses need not have `subject`; confirmation calls still require it.
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
- generic entity view: [app/src/routes/genc/[entity_id]/+page.svelte](./app/src/routes/genc/[entity_id]/+page.svelte)
- user view/edit: [app/src/routes/user/[user_id]/+page.svelte](./app/src/routes/user/[user_id]/+page.svelte), [app/src/routes/user/[user_id]/edit/+page.svelte](./app/src/routes/user/[user_id]/edit/+page.svelte)
- browse with filter and entity list, and about: [app/src/routes/browse/+page.svelte](./app/src/routes/browse/+page.svelte), [app/src/routes/about/+page.svelte](./app/src/routes/about/+page.svelte)
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
- keep business rules in endpoints and presentation calculations in contextual components

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

- Consume graph data from ID-only `guids` store helpers. Gather `const relatedRows = $derived(relationsOf(id))`, filter relation rows by `typeOf(row.rk)`, then use `nameOf(row.rk)` or `entityOf(row.rk)` for entity attributes. Keep relationship fields such as rank/role/membership state on the raw row.
- Graph-dependent feature helpers also use the current graph implicitly: `matchSummary(matchId)` and `outstandingTeamRounds(userId, teamId)`. Outstanding rounds are raw user-round relations; `roundView(entityOf(row.rk), teamRoundRelation)` resolves fixture/result display separately.
- Use callback-based `ActionConfirmation` for confirmation plus API-subject navigation and `ActionQuick` for immediate actions that stay on the page. Keep endpoint/payload details in named `remote.ts` functions. The former `apiService.svelte` has been removed.
- Use `routeLink.svelte` for navigation-only rows. Use `RouteLinkHiddenAction.svelte` for rows with quick actions; supply status colours via `colour`, not an extra decorative dot in the detail snippet.
- Use `hiddenOptions.svelte` for rows without an `href` that hide options, help or status text.
- Link to entities with `hrefOf(id)` (`/<type>/<id>`) and `imageOf(id)` from the `guids` store; never link to `genc/...` from new code.
- Persist auth/session state in the `local` store only; use `auth.ts` for session establishment/cleanup and cryptography.
- Keep API traffic behind named functions in `remote.ts`; components supply arguments through deferred action callbacks.

### New helper/service/component policy

Add new shared primitives only if:

1. the need appears in multiple features, and
2. reuse of existing primitives would create brittle or duplicated code.

If added, document it in this file under the relevant section.

---

## 7) Current Non-Goals (Intentional)

- No specialized analytics/reporting model beyond base telemetry

Keep shared infrastructure composable while implementing feature rules in their own modules.

## Doubles ladders

- Users request membership individually. A ladder admin passes two pending `user_ids` to `ladder/{id}/accept`.
- Each acceptance creates a new ladder-specific `pair` entity (`ladder_id`) with permanent, equal `role: "member"` user relations. Existing pairs created before `ladder_id` was added resolve their ladder through the mirrored ladder relation.
- Pair/ladder relations carry competitive rank, points and state. User/ladder relations preserve admin flags and record pending/paired membership, not competitive state.
- `match/create` accepts pair IDs for doubles and user IDs for singles. Match/competitor relations carry challenger/defender roles and results. Doubles matches also link all four users with `role: "participant"` and `competitor_id` for personal history and score permissions.
- `doCompetitorUsers.ts` resolves a competitor to real users for authentication and notification fan-out. Used across match endpoints, completion, retirement, messaging and scheduled processing. It never sends push itself.
- Either partner can challenge, accept for the defending pair, or forfeit for their pair. All four users and ladder admins can submit scores. Unrelated authenticated users may message, but only match participants receive message notifications.
- `pair/{pair_id}/retire` allows a pair member or ladder admin to forfeit unresolved matches, retire the ladder relation, close ranking gaps and return both users to pending. Pair membership and historical matches remain intact; re-pairing creates a new entity.
- Away status is per user-ladder membership. Either doubles partner can go away without partner confirmation: forfeit ongoing pair matches and mark the pair away, preserving the other user's personal status. Returning a user becomes active personally; the pair stays away while either user is away and enters cooling only when both are back. Singles return directly to cooling.
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
- `app/src/lib/stores/branding.ts` selects the current hostname's club from the public graph. CSS variables theme shared controls, page headings and generic app icons. Club `background_text` and `foreground_text` optionally set text colors on `.blue` and `.pink` controls; both default to white. Unknown hosts retain default app branding; entity photos and graph visibility are unchanged.
- `system/manifest?origin=<frontend origin>` returns a registered club's PWA manifest, name, colours and icon, with start URL/scope on that frontend origin. Unknown or malformed origins return 404.
- `doClubForOrigin` is shared by the manifest endpoint and push sender. Push branding uses each subscription's stored origin, never ladder context or membership. Missing branding falls back to the current static notification icon.
- Bootstrap source is `shared/sample-data.json`, with both directions of club-admin relations. Editing it does not restore or delete live storage data.

## Club provisioning

- `POST club/create` is bot-key authenticated. There is no Svelte creation form. Body is `{ caller_id: "bot_...", signature: "<bot key>", data: { name, url, foreground, background, foreground_text?, background_text?, admin_user_id, image, ...attributes } }`. The optional text-color attributes are six-digit hex values. Bots do not use ECDSA or need a device ID.
- `image` is raw Base64 or a JPEG data URL, exactly 512x512 and at most 2 MB. Sharp validates and resizes actual image data, including EXIF orientation.
- A new club GUID is generated. Club attributes are saved on its entity, and the existing admin user gets mirrored `{ is_admin: true }` relations. Input image/admin fields are not club attributes.
- Public assets: original `<club_id>.jpg`, plus `<club_id>_180.png`, `<club_id>_192.png`, `<club_id>_512.png`. The manifest uses explicit 192/512 PNG entries; the Apple touch icon uses the 180 PNG.
- Icons are uploaded before graph publication. Pre-publication failures attempt cleanup of only newly generated resources. An export failure returns 503 with `created: true` and the club ID so callers do not blindly recreate it.
- Existing clubs created through restore/manual uploads need equivalent PNG variants; this endpoint creates new clubs and does not migrate existing records/assets. DNS, domain binding and CORS remain manual.
- Request example and operational details: [docs/club-create.md](./docs/club-create.md).

## Default ladder image

- `ladder/create` uses a supplied `data.image` first. Otherwise it resolves the frontend `Origin` header through `doClubForOrigin` and copies that club's existing public `<club_id>.jpg` to the new `<ladder_id>.jpg`.
- `doAssetToPublic` accepts `{ publicName }` to copy an existing blob in the same public container, in addition to local asset names and uploaded buffers. No arbitrary remote URLs are fetched.
- Missing known-club icon blobs retain the default local `icon-00.jpg` fallback. Ladder/team creation requires a registered hostname origin, and the associated club is resolved from that origin rather than submitted `data.club_id`.

## Bot access

- API-only `INTRA_CLUB_BOT_KEY` references vault secret `intra-club-bot-key`. The owner creates the secret; deployment wires its reference and does not generate/read the value. The old `SYSTEM_BOT_SECRET` path is removed.
- `doBotVerification` (exported from `doSignatureVerification.ts`) requires a `bot_...` caller ID and the exact key in `signature`. Missing/unresolved configuration and wrong keys fail closed; comparison uses fixed-length SHA-256 digests and `timingSafeEqual`. Never log request credentials.
- `system/restore` and `club/create` require this bot authentication before validation/writes. Restore now accepts `{ caller_id, signature, data: [ ...rows ] }`; a raw unauthenticated array is no longer accepted. Bootstrap works with an empty graph because bot verification does not require a bot row to exist.
- Existing mutation endpoints accept bot keys through `doSignatureVerification` and allow bots to omit `device_id`; endpoint-specific role/ownership rules still apply. Human callers retain device-based ECDSA authentication. `user/push` remains a real-user/device endpoint.
- `system/about` and `system/manifest` remain public. OTP/login/signup remain public entry flows. No key is exposed to frontend configuration.
- Examples: [docs/bot-access.md](./docs/bot-access.md).

## Deployment plan and displayed version

- SWA uses the Standard SKU in the shared infrastructure template for both branch-selected environments.
- `system/about` owns the displayed `data.version` string, currently `261125`. The layout loads it through unsigned `getSystemAbout()` on mount and displays that exact value in the footer. There is no build-time/hardcoded frontend version fallback.
- The about endpoint remains public and retains the Web Push public key required for registration; legacy OneSignal App IDs are not returned.

## Teams and TROLS competitions

- `team` and `round` are the competition entity types. Teams resolve their club from `Origin` via `doClubForOrigin` and store ownership only in mirrored club-team relations; submitted club IDs are ignored. Ladder creation now uses that same hostname context for both its club relation and icon. Unknown origins cannot create ladders or teams.
- `team/options` is a read-only public discovery endpoint. `team/create` validates the full BRTA selection before saving a pending request. `team/activate`, `team/join`, `team/accept`, and `team/sync` take `data.team_id`; ID-addressed aliases (`team/{team_id}/...`) also exist. Mutations retain the existing signature and response conventions.
- Only approved team members and team administrators can refresh an active team through `team/sync`; pending applicants and unrelated users cannot.
- Club administrators approve team creation. The creator is recorded as `{ is_admin: true, is_member: true }` on mirrored user-team relations while the team itself awaits approval. Ordinary membership requests carry `{ state: "pending" }`; accepted members use `{ role: "is_member" }`, and boolean `is_member: true` is also supported. Administrator authority uses the boolean `is_admin`, with legacy admin roles supported during rollout. Activation/refresh adds the member flag to existing admin relations. `club_id` and `requested_by` are removed from team entities during activation/refresh after their mirrored relations are repaired. `teamRelations.ts` shares graph ownership, membership and migration rules across endpoints and sync. Every relation is mirrored using `doUpsertRelation`.
- `competitionData.ts` defines the stored external-data boundary shared by creation, sync and migration. Team source mappings/statistics and round source values use `ext_*` (for example `ext_competition`, `ext_team`, `ext_date`, `ext_venue`, `ext_points_for`, `ext_match`). Literal source labels alone use `ext_status`; synthetic scheduled/completed classifications are never stored there. Round app fields are `name`, `state` and the generated `external_key`. The owning team's home flag is a boolean `is_home` on both team-round mirrors (`true` for home, `false` for away and byes); no `home_away` or `is_home` is stored on the round entity. The owning team's normalized `result` belongs on both mirrored team-round relation rows; it is never stored on the round entity. `state` is `pending` until resolved and `complete` for scored results, byes and washouts; scored `result` uses `winner`, `loser` or `draw`, with `bye`/`washout` for resolved no-play rounds. Do not infer active/completion from dates. `last_synced` is an app timestamp. Frontend `roundView`/`teamView` derive display aliases without mutating the shared graph; legacy records remain readable until refresh migrates them in place. Outcome/home-flag migration writes both relation mirrors before removing the legacy entity attributes and preserves unrelated relationship attributes.
- `competitionProvider.ts` defines the provider-owned snapshot contract. `trols.ts` performs fixed-origin POST requests, short-lived discovery caching and defensive HTML parsing. It verifies the returned selections and season; a season rollover never repoints an existing team. No parsing library or scheduled synchronisation was added.
- `doSyncTeam.ts` supplies reusable sync and round-user backfill logic. Round names are `Round <number> vs <opponent>` regardless of home/away. Ownership is stored only as mirrored team-round relations; sync removes the legacy round `team_id` attribute while preserving IDs and local relationships. API permissions, round pages and home-page grouping resolve ownership from the graph. External round identity is provider + association + season + section + external team + round number or finals stage, scoped to the owning internal team. Dates are mutable; round IDs, messages and existing player roles survive refresh. TROLS owns schedule/results/standings; Intra Club owns membership and local relations. Numbered byes are rounds. Semi Final and Grand Final calendar dates create pending rounds for team availability. Their stage identifies them across date changes. Numbered finals with known teams use the normal round importer.
- `round/role` (also `round/{round_id}/role`) takes `data.round_id`, optional `data.user_id`, and `data.role`. Round-user relations have only `role`: pending, available, unavailable or selected. Players can revise availability, but selected players can only mark themselves unavailable. Team admins select available players, including themselves, or return selected players to available. Completed rounds cannot be changed.
- New team endpoints use conditional ETag updates on existing club/team entities for short-lived operation leases, preventing concurrent duplicate creation, sync and role transitions. Team `operation_guard` stores an expiry timestamp while busy and `0` when released; it is operational metadata, not a boolean. The legacy `operation_until` field is honored during rollout and removed on migration. The guard remains on the team entity; nothing was moved to `auths`. No new table or lock entity exists. Mutation errors may require a refresh/retry; storage remains sequential across mirrored rows, as elsewhere in the app. Missing round-user mirrors are repaired during sync/backfill.
- A successful selection notifies the nominated player; `selected -> unavailable` notifies team admins, linking to the affected round. Notifications follow graph publication and are best effort; push failure never undoes a role change and there is no durable queue.
- `message/create` accepts exactly one of `match_id` or `round_id`. Round messaging reuses `doPostMessage`, signed requests and public graph relations, and is open to authenticated non-members. It notifies approved team members other than the sender based on team membership, not round-player links. The service's legacy `matchId` argument names its parent entity ID and also accepts round IDs.
- UI: `/team/create`, `/team/{id}`, `/round/{id}`, Browse links, pending team approvals on the club administrator's user page, and upcoming rounds grouped by team on the user home page. `components/rounds/roundRules.ts` and `roundRoleDot.svelte` share the role colours and graph-derived displays. No home-page API was added.
- Verification: existing backend/frontend commands still apply. `api/test/team.test.cjs` exercises graph/permission/sync/notification rules; `api/test/trols.test.cjs` uses captured public TROLS HTML with personal contact rows removed. `app/test/rounds.test.mjs` verifies inverse round relationships, grouping, filtering, colours and results. See `docs/teams.md` for usage and operational limits.

## Groups

- Group entities contain `name` and `state` (`pending`/`active`). Images use the existing public `<group_id>.jpg` convention, copied from hostname club branding unless supplied. Ownership is a mirrored club-group relation; no club/user foreign keys or image data are stored on group entities.
- `group/create` resolves the club from `Origin`, records the creator as `{ is_admin: true, is_participant: true }` on both user-group mirrors, and requests club approval. `group/{group_id}/activate` requires that group's club admin. `join` requires an active group and writes `{ state: "pending", is_participant: false }`; `accept` requires a group admin and replaces pending state with `is_participant: true`. `update` permits only name/image, for group admins. All mutations use the existing signed request, graph export and API response conventions.
- `message/create` accepts exactly one `match_id`, `round_id` or `group_id`. Any signed-in user may post to a group. Group notifications go to every participant, including the sender, excluding pending applicants and admin-only relations. Existing match/round recipients are unchanged. Group notification failures do not undo persisted mutations/messages.
- Group pages follow entity headers/icons, expandable participants, pending approval/join/accept and shared message UI. Participant groups appear below teams on user pages; pending memberships remain visible for acceptance, and club admins see pending group approvals. Browse lists groups and offers New Group on an unmatched filter. Group create/edit pages accept only name/image.
- `api/test/group.test.cjs` covers club ownership, approvals, membership, permissions, images, editing and messaging recipients using in-memory storage. Run the existing API/frontend checks for verification.

## Ladder setting definitions

- Keep frontend labels/help/options in `app/src/lib/components/ladders/ladderSettings.ts` and API validation in `api/src/functions/ladderCreate.ts`; definitions remain separate by design and must be kept in step.
- Creation supports `win_points`, `half_rank`, `the_percent_fixed`, `static_1`; do not offer `open` or any `static_range_*` option. No backwards compatibility for the removed setting keys is required.
- `the_percent_fixed` allows a climb of `floor(rankedCompetitorCount / 10)` places for every participant, independent of their own rank (60–69 entries: 6 places; 70 entries: 7). Count all current `is_participant: true` competitors, including away/busy/cooling, but exclude pending/left/retired/admin-only links. Doubles count ranked pairs, not individual partner memberships. Apply the same rule in frontend eligibility and API enforcement; no compatibility with the former sliding option. Existing half-rank behaviour is unchanged.
- Cool period defaults to 3 days with allowed creation range 1–9. Missing-setting deadline/cooling/notification fallbacks use 3 days; explicit settings on existing ladders remain in effect.
- Enum options contain separate display `label` and `description`; stored keys remain unchanged. `ladderStates` was unused and removed. Keep settings fields in the creation page for now.

## Entity action presentation and membership changes

- `EntityActions.svelte` owns centred summary, help toggle, optional More Options expansion and wrapping action layout. Summary/help content uses groups; controls sit in an ungrouped row beneath it, and expanded help appears above the controls. Pending approvals live in the entity action component, never in a separate Pending panel. Entity-specific `LadderActions`, `TeamActions`, `GroupActions`, `RoundActions`, and `MatchActions` determine permissions/content and supply deferred named remote functions. Pages retain headers and content composition.
- Page-level actions use `ActionConfirmation`, with `arrow showLabel` for a readable label plus arrow; existing `arrow` callers retain icon-only behaviour. All enabled confirmation triggers use the foreground colour, including arrows; disabled triggers remain grey. Row-level status dots reveal `ActionQuick`. Round availability and match acceptance stay visible; match forfeiture is under More Options; memberships reveal away/return/leave beneath More Options. Ladder help explains only selected settings, including cooling/play periods.
- User-page ladder sections show confirmed accept joiner (disabled pending pair for doubles), contextual match rows with quick accept/forfeit, or a confirmed issue challenge for an eligible competitive entry; otherwise show the plain empty-match row. Doubles challenges resolve both pair IDs. Team sections show confirmed accept joiner and quick pending/selected-round availability.
- `membership.ts` implements signed `ladder/{id}/leave`, `ladder/{id}/return`, and shared team and group leave logic. `ladderAway.ts` delegates away. `teamLeave.ts` and `groupLeave.ts` register their respective leave routes. Credentials always identify the acting user; no target user is accepted.
- Away/leave forfeit the affected competitor's pending/active matches on that ladder via `doCompleteMatch`. Leave checks all affected users for last-admin protection before any forfeitures or membership changes. Either doubles partner withdraws both partners and their pair; immutable pair membership and match history remain. Singles/pair withdrawal removes competitive rank and closes gaps. Relations remain mirrored with state left and inactive membership/admin flags; user pages omit left memberships and join allows a fresh request. Team leave marks unfinished round availability unavailable and preserves completed history.
- Last-admin rejection comes from the API and is shown after confirmation; do not disable leave preemptively in the UI. Group/team join, acceptance, round-role and membership confirmations return API navigation subjects. Quick actions use the same outcomes without navigating.

- Membership mutations acquire an ETag-conditional, expiring `operation_guard` on their entity and re-read membership under it. This serializes partner changes and last-admin departures; team changes respect the existing sync lease. Busy/CAS conflicts return 409 for refresh/retry. The guard is released on success and rejection; graph writes remain sequential across mirrored rows.

- `teamDescription` in `rounds/roundRules.ts` shares the association/section/rank summary between team pages and user-page team sections. Preserve source display names, uppercase the association code, and omit missing fields without empty separators.

- Action colour indicates interaction: enabled `ActionQuick` and `ActionLink` use background/blue; enabled `ActionConfirmation` uses foreground/pink. Disabled actions remain grey. Progress and arrow icons use a 24-unit viewBox, 1rem size, stroke width 3 and round caps/joins.
- More Options marks its content as `action-options`; only the last button/link in each option row shows its decorative `.action-arrow`. Arrows stay available in component markup so conditional options and inline controls work without DOM mutation.
- `ActionLink.svelte` is a navigation button styled alongside native buttons. Entity action sections may supply an options snippet for admin edit links, including a separate More Options row for an admin who has not joined the ladder.
- Team admins can change only the icon at `/team/{id}/edit`, using signed `team/{id}/update` (also `team/update`). The name is displayed in a read-only input; the API rejects name and competition/source changes.

- More/More Options always replace the heading row with inline options, remove the toggle/minus button while open, and revert after 9 seconds of inactivity. Ongoing API work, confirmation/error dialogs pause the timeout; it restarts on interaction/completion. Informational expandable sections keep their normal persistent layout. EntityActions supplies children and extra options as direct inline siblings, so edit is in the same row and only the last option shows its arrow.

- Descriptions and secondary metadata use the shared `.description` class (`text-transform: lowercase`), including route rows, hidden/action rows, versus rows, header subtitles and entity summaries. Apply this at presentation boundaries; preserve source values, entity titles and message contents.

- User-profile ladder sections show a plain No pending matches/dash row when there are no pending or active matches in that ladder, on both own and other profiles. If the viewer can challenge the user, show the challenge action instead of the empty row; do not render a disabled cannot challenge button. Team sections show No pending rounds/dash when there are no pending/selected unfinished rounds, for all viewers. These empty rows have no actions.

- Page-level More Options is the last item after content, history and messages. EntityActions and entity action components accept `section="primary"`/`section="options"` to place routine actions at the top and hidden options at the bottom without duplicating permission logic. More Options uses standard button/text margin and padding; allow wrapping rather than compressing controls. Group admin edit belongs after leave group in More Options.
