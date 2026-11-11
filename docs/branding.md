# Hostname branding

The app matches `window.location.hostname` against a club entity's `url`. Store a bare, lowercase hostname, such as `next.intra.club`, without a scheme, port or path.

`background` controls the page surface, formerly blue controls and browser/install theme colour. `foreground` controls the action accent, formerly pink controls and confirmations. Both accept six-digit hex values. Optional `background_text` and `foreground_text` set the text colour on `.blue` and `.pink` controls respectively; they also accept six-digit hex values and default to white. Intra Club uses background `#00BFFF` and foreground `#FF1493`; Next Club uses background `#B67233` and foreground `#00BFFF`.

The selected club name and public `<club_id>.jpg` asset are used for generic app headings/icons and the browser favicon. Apple touch icons use `<club_id>_180.png`; the manifest uses `<club_id>_192.png` and `<club_id>_512.png` with explicit sizes. Member avatars and ladder images stay attached to their own entities. The unsigned `club/create` endpoint requires a 512x512 JPEG and generates 180, 192 and 512 PNG variants. Existing manually uploaded clubs need those equivalent variant files.

The manifest is served by `GET /api/system/manifest?origin=https%3A%2F%2Fnext.intra.club`. Its start URL, scope and stable app ID use that frontend origin. Only origins matching configured club hostnames receive a manifest. Existing installed app names/icons may require reinstalling or an OS/browser update cycle to refresh.

Push continues to select all registered devices for recipient users. Each notification uses its device's origin for navigation and that origin's club icon for branding. No user-club membership relation, club filtering or notification routing changes are introduced. The shared VAPID pair is unchanged.

`shared/sample-data.json` contains the supplied two-club bootstrap and mirrored admin relations. It is source data only: neither deployment nor these code changes call `system/restore`. Load those club records through the existing data workflow to activate branding. Icons must already be present in the deployment's public blob container.

Hosting still requires DNS, a SWA custom-domain binding with HTTPS, and API/blob CORS for the frontend origin. Infrastructure allows `https://*.intra.club` in both API and blob CORS, so new HTTPS subdomains do not need individual CORS entries. Localhost remains allowed; the API also allows its default SWA hostname. The wildcard does not include the apex `https://intra.club` or unrelated custom domains. No DNS records or domain bindings are modified by this change.
