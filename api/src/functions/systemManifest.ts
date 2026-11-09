import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { doClubForOrigin } from "../services/doClubForOrigin";

export async function systemManifest(request: HttpRequest): Promise<HttpResponseInit> {
    const origin = request.query.get("origin");
    let club: Awaited<ReturnType<typeof doClubForOrigin>>;
    try { club = origin ? await doClubForOrigin(origin) : null; }
    catch { return { status: 503, jsonBody: { success: false, message: "Branding is unavailable" } }; }
    if (!club) return { status: 404, jsonBody: { success: false, message: "No club configured for this origin" } };
    return {
        status: 200,
        headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" },
        jsonBody: {
            id: `${origin}/`, name: club.name, short_name: club.name,
            start_url: `${origin}/`, scope: `${origin}/`, display: "standalone",
            theme_color: club.foreground, background_color: club.foreground,
            icons: [{ src: club.icon, sizes: "any", type: "image/jpeg", purpose: "any" }]
        }
    };
}

app.http("systemManifest", { methods: ["GET"], route: "system/manifest", authLevel: "anonymous", handler: systemManifest });
