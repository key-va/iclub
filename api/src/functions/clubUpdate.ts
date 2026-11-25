import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { clubIconAssets } from "../services/clubIconAssets";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { get, reply, signedEntityRequest } from "../services/clubEntityRequests";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { updateIfCurrent } from "../services/joinRejection";

const limits = new Map([
    ["name", 120], ["foreground", 7], ["background", 7], ["contact_name", 120], ["contact_email", 254], ["address", 500], ["rules", 5000],
]);

export async function clubUpdate(request: HttpRequest, context: InvocationContext) {
    const signed = await signedEntityRequest(request, context, "club");
    if ("status" in signed) return signed;
    const id = request.params.club_id;
    if (!id?.startsWith("club_")) return reply(400, "club_id is required");
    const club = await get("club", id);
    if (!club) return reply(404, "Club not found");
    if ((await get(id, signed.caller_id))?.is_admin !== true)
        return reply(403, "Only a club admin can update the club");

    const { image, ...details } = signed.data;
    const changes: Record<string, string> = {};
    for (const [key, value] of Object.entries(details)) {
        const limit = limits.get(key);
        if (!limit || typeof value !== "string" || value.trim().length > limit)
            return reply(400, "Only valid club details can be updated");
        const clean = value.trim();
        if (key === "name" && !clean) return reply(400, "Enter a club name");
        if ((key === "foreground" || key === "background") && !/^#[\da-f]{6}$/i.test(clean))
            return reply(400, "Club colours must be six-digit hex colours");
        if (key === "contact_email" && clean && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean))
            return reply(400, "Enter a valid contact email");
        changes[key] = clean;
    }
    if (!Object.keys(changes).length && image === undefined)
        return reply(400, "Supply club details or an image");
    let assets: Awaited<ReturnType<typeof clubIconAssets>> = [];
    if (image !== undefined) {
        try {
            assets = await clubIconAssets(id, image);
        } catch {
            return reply(400, "image must be a valid, complete 512x512 JPEG of at most 2 MB");
        }
    }
    for (const asset of assets) await doAssetToPublic(asset.content, asset.name);
    if (Object.keys(changes).length && !(await updateIfCurrent(club, changes)))
        return reply(409, "The club changed. Refresh and retry.");
    await doGuidsToPublic();
    return reply(200, "Club updated", id);
}

app.http("clubUpdate", {
    methods: ["POST"],
    route: "club/{club_id}/update",
    authLevel: "anonymous",
    handler: clubUpdate,
});
