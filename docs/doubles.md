# Doubles ladders

Users join individually. A ladder admin selects two pending users and creates a pair. Pair membership is permanent and equal; a new pairing always creates a new pair ID. A user may belong to different pairs in different ladders.

The pair's ladder relation owns its rank, points and competitive state. User ladder relations preserve administration and pending/paired membership. Singles continue to use user competitors.

Either member may challenge from the ladder standings, accept for the defending pair, or forfeit for their pair. All four participants and ladder admins may submit scores. Pair details show members, standings, matches and the retirement action. User pages show their pair's rank/state and their personal match history.

Retirement is available to either member or a ladder admin. It forfeits pending/active matches before removing the pair from the standings, closes ranking gaps and returns both users to pending. Pair entities, permanent membership and finished matches remain available. Retirement does not affect pairs on other ladders. Global away status is not implemented; the existing singles away action rejects doubles.

Messages remain open to authenticated users. Notifications resolve competitors to real users: opposing pair for challenges/acceptance, all four participants for results, forfeits, messages and deadline warnings (excluding the sender where applicable). A missing OneSignal configuration does not block mutations.

## API and graph

- `ladder/{id}/join`: individual request, unchanged payload.
- `ladder/{id}/accept`: `data.user_ids` containing two distinct pending user IDs for doubles; `data.user_id` for singles.
- `match/create`: `data.ladder_id`, `challenger_id`, `defender_id`. Competitors must be pair IDs for doubles and user IDs for singles.
- `match/{id}/accept`, `/complete`, `/forfeit`: existing payloads; permissions support pair members.
- `pair/{id}/retire`: signed request with no additional data.

Pair/user relations use `role: "member"`. Match/pair relations use `challenger`/`defender` roles and own scores/results. Match/user relations use `role: "participant"` and `competitor_id`, with copied results for history. Every relation is mirrored using the existing service.

Existing pairs without the new entity `ladder_id` attribute continue to work through their ladder graph relation. No storage migration or seed data is required.

## Verification

```
cd api
npm ci
npm test
cd ../app
npm ci
npm run check
npm test
npm run build
```

API tests exercise real endpoint/service code against an in-memory TableClient, including mirrored persistence, pairing, permissions, all four score submitters, all four forfeiting users, rank/points systems, retirement/re-pairing, cross-ladder membership, deadlines, cooling, notification recipients and singles regression. Signature verification, public export and OneSignal are mocked; these tests never connect to Azure. Frontend tests load the actual TypeScript modules through Vite and check pair/singles summaries and challenge controls.

## Checks requiring a configured Azure environment

- Real device signatures and Azure Functions route discovery for the new retirement endpoint.
- Azure Table permissions, mirrored writes, public `guids.json` export and browser refresh after each workflow step.
- Browser workflow with four signed-in users and an admin: join, pair, challenge, accept, score, retire and re-pair; confirm old match links remain usable.
- Hourly timer execution, timestamps, warnings, automatic forfeits and cooling release.
- Actual OneSignal delivery/alias targeting, including messages from a nonparticipant.
- Concurrent mutation and interrupted-write recovery. Like the existing singles implementation, graph changes span multiple partitions and are sequential rather than transactional; concurrent requests or storage failures can require reconciliation.

No live storage, secrets or Azure infrastructure are needed for the automated checks. Do not populate storage or deploy as part of verification. The implementation commit skips CI because the repository's push workflows deploy to Azure.
