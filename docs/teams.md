# Teams and BRTA competitions

On the club's registered hostname, open **Menu → Request a Team** (also available from Browse). Select BRTA, competition/season, section and team. These choices come from TROLS and do not write graph data. The submitted request becomes pending under the hostname's club, with its icon unless a custom JPEG is supplied.

A club administrator sees pending teams on their home/user page, opens a team and chooses **approve team**. Approval first validates a complete TROLS snapshot. External fetch/parse failure leaves the team pending so approval can be retried. On success the requesting user becomes team administrator, rounds are imported and the team becomes active.

Authenticated users can request membership from an active team page. Team administrators accept them there. Accepted players start pending for each existing round; new rounds also give all approved members a pending role. Team administrators count as approved members.

Open a round from the team page or your home page to set your own availability. The coloured dots mean selected (green), available (blue), unavailable (red) and pending (grey). Team administrators can select other available players and deselect them to available. Administrators cannot select themselves. Anyone signed in can post round messages, including visitors who do not belong to the team.

If a selected player marks themselves unavailable, the existing Web Push service sends all approved team members a replacement-player notification linking to that round. Repeating the same request does not send another notification. Direct Web Push installation/permission requirements remain those documented in [web-push.md](web-push.md); no OneSignal configuration is needed.

## Refreshing TROLS

The team administrator can choose **refresh TROLS**. This refreshes official schedules, results and standings, returning created/updated counts. Round names are `Round <number> vs <opponent>`, regardless of home/away. Ownership uses mirrored team-round relation rows rather than a `team_id` attribute on the round. Refreshing an existing team updates names and removes that legacy attribute in place. Dates may change without changing internal round IDs. Memberships, player responses/selections and messages are retained. A past date alone never marks a round completed. A missing result does not erase an existing official result. Byes are numbered rounds; no-play/finals dates without known encounters appear as competition calendar information.

Only current BRTA competitions exposed by TROLS are discoverable. The stored season is checked on every sync. If TROLS rolls a competition code to a new season, the old team is retained and sync fails safely: request a separate team for the new season. No background/hourly sync was introduced.

## Source fields and app fields

Imported values and external mapping metadata are stored under `ext_…`. Numbers and dates are parsed into useful types/formats, but retain their source meaning. The prefix marks data ownership, not an unprocessed copy of the source HTML.

| Entity | External data / mapping fields | App interpretation |
| --- | --- | --- |
| Team | `ext_provider`, `ext_association`, `ext_competition`, `ext_competition_name`, `ext_section`, `ext_section_name`, `ext_team`, `ext_season`, `ext_name`, `ext_standings`, `ext_calendar`, `ext_rank`, `ext_wins`, `ext_points`, `ext_percentage` | Canonical display `name`, approval `state`, `last_synced` and existing local administration attributes |
| Round | `ext_provider`, `ext_number`, `ext_date`, `ext_opponent`, `ext_venue`, `ext_match`, `ext_points_for/against`, `ext_sets_for/against`, `ext_games_for/against`, optional literal `ext_status` | Generated `name`, lifecycle `state`, team-relative `home_away`, generated stable `external_key` |

The owning team's normalized `result` is stored on **both mirrored team-round relation rows**, with the same value in each direction. It is not a round entity attribute. Existing relationship attributes are retained; pending rounds have no result value.

`ext_status` preserves a literal label such as **Bye**, **Wash Out**, or **Postponed** when the source provides one. TROLS does not provide a literal “completed” field: the app recognizes a scored result. Consequently there is no stored `status`, and synthetic `scheduled`/`completed` strings are not written to `ext_status`.

Rounds use `pending` before a result (including postponed rounds) and `complete` once resolved. A scored round's team relation has `result: winner`, `loser`, or `draw` from that team's perspective. Byes and washouts have relationship `result: bye` or `washout`; `complete` means the round is resolved, not necessarily that tennis was played. An elapsed date alone never changes its state. The importer has no evidence of live play, so it does not invent an `active` state.

The app uses a canonical `name` on every entity, as elsewhere in the graph. Round names combine the external round number and opponent, for example `Round 12 vs Kings Park Royals`. `home_away` is derived by locating the owning team in the source encounter; `external_key` is generated from the source mapping and round number. They are app interpretations rather than literal TROLS attributes.

**Migration:** after deployment, **refresh TROLS** migrates existing team/round entities in place, replacing old unprefixed source fields and `status`, moving legacy entity `result` to both team-round mirrors, and keeping the same IDs, graph links, availability, selections and messages. Older datasets remain readable during rollout through derived frontend views. Pending teams receive the same migration during activation. No bulk or scheduled migration was added. Legacy synthetic classifications can be mapped to app state/result; they are not relabelled as literal external status text.

## API

The existing signed envelope (`caller_id`, `device_id`, `signature`, `data`) and standard success/message/subject/data responses apply. Discovery is unsigned.

| Route | `data` | Authority |
| --- | --- | --- |
| `team/options` | `association: "brta"`, optional `competition`, `section` | Public/read only |
| `team/create` | `association`, `competition`, `section`, `team`, optional JPEG `image` | Authenticated user, registered club `Origin` |
| `team/activate` | `team_id` | Associated club administrator |
| `team/join` | `team_id` | Authenticated user |
| `team/accept` | `team_id`, `user_id` | Team administrator |
| `team/sync` | `team_id` | Active team's administrator |
| `round/role` | `round_id`, `role`, optional `user_id` (defaults to caller) | Player/self or team administrator as above |
| `message/create` | `round_id`, `text` | Any authenticated user |

`team/{team_id}/{activate,join,accept,sync}` and `round/{round_id}/role` aliases follow existing entity route conventions. Unknown/missing club origins cannot create teams or ladders. A supplied `club_id` cannot override hostname resolution.

## Failure handling and verification

External fetching/parsing and the complete round update plan are validated before sync writes. Unsupported/malformed data produces an error and retains the previous valid source data. No external URLs or IDs are accepted without validating them against source selections. Discovery responses are cached for one minute; sync always fetches fresh data with bounded request timeouts.

ETag leases on existing club/team rows prevent overlapping requests. A busy operation returns 409 for retry. Existing Azure Table graph writes still span multiple partitions and are sequential: an Azure outage can leave partial writes. Refresh/retry sync repairs missing round-user links, preserves already recorded roles and never deletes messages. Sync is designed to be safely repeatable after recovery, but is not an atomic multi-partition transaction. Push remains best effort; an invocation crash between persistence and delivery can lose a notification. There is no durable notification outbox.

Verification performed for this feature includes backend in-memory Azure/signature/push tests, captured TROLS parsing tests, frontend graph tests, Svelte diagnostics, a production build, and Chromium mobile-width flows using mocked API/graph responses. Live read-only BRTA discovery/import was also verified. Live Azure writes and device push delivery require the configured deployed environment; they are not exercised by the offline suite.

Run:

```sh
cd api
npm install
npm test
cd ../app
npm install
npm run check
npm test
VITE_PREFIX=<your-resource-prefix> npm run build
```
