# Hostname branding

The app matches `window.location.hostname` against a club entity's `url`. Store a bare, lowercase hostname, such as `next.intra.club`, without a scheme, port or path.

`foreground` replaces the existing blue colour (page surface, blue controls and theme colour). `background` replaces the existing pink accent (pink controls and confirmations). Both accept six-digit hex values. These attribute names follow the supplied data; `background` does not replace the main blue page surface.

The selected club name and public `<club_id>.jpg` asset are used for generic app headings/icons, browser favicon, Apple touch icon and the install manifest. Member avatars and ladder images stay attached to their own entities. Use square JPEG club icons, ideally at least 512 by 512 pixels, for installation on mobile devices.

The manifest is served by `GET /api/system/manifest?origin=https%3A%2F%2Fnext.intra.club`. Its start URL, scope and stable app ID use that frontend origin. Only origins matching configured club hostnames receive a manifest. Existing installed app names/icons may require reinstalling or an OS/browser update cycle to refresh.

Push continues to select all registered devices for recipient users. Each notification uses its device's origin for navigation and that origin's club icon for branding. No user-club membership relation, club filtering or notification routing changes are introduced. The shared VAPID pair is unchanged.

`shared/sample-data.json` contains the supplied two-club bootstrap and mirrored admin relations. It is source data only: neither deployment nor these code changes call `system/restore`. Load those club records through the existing data workflow to activate branding. Icons must already be present in the deployment's public blob container.

Hosting still requires DNS, a SWA custom-domain binding with HTTPS, and API/blob CORS for the frontend origin. Infrastructure now includes `next.intra.club` in its CORS origins. No DNS records or domain bindings are modified by this change.
