import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import sharp from "sharp";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { doAssetFromPublic } from "../services/doAssetFromPublic";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { resourceName, resourceSuffix } from "../stores/resourceNames";

const client = new TableClient(`https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`, "guids", new DefaultAzureCredential());
const maxImageBytes = 2 * 1024 * 1024;
const invalid = (message: string): HttpResponseInit => ({ status: 400, jsonBody: { success: false, message } });

// Intentionally unsigned: clubs are provisioned by request, without a Svelte form.
export async function clubCreate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    let body: { data?: Record<string, unknown> };
    try { body = await request.json() as typeof body; }
    catch { return invalid("Invalid JSON payload"); }
    if (!body?.data || typeof body.data !== "object" || Array.isArray(body.data)) return invalid("data is required");
    const { admin_user_id, image, ...attributes } = body.data;
    const { name, url, foreground, background } = attributes;
    if (typeof name !== "string" || !name.trim()) return invalid("name is required");
    if (typeof url !== "string") return invalid("url must be a hostname without scheme, port or path");
    const hostname = url.trim().toLowerCase();
    if (hostname.length > 253 || !hostname.includes(".") || !hostname.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
        return invalid("url must be a hostname without scheme, port or path");
    }
    if (![foreground, background].every(value => typeof value === "string" && /^#[\da-f]{6}$/i.test(value))) return invalid("foreground and background must be six-digit hex colours");
    if (typeof admin_user_id !== "string" || !admin_user_id.startsWith("user_")) return invalid("admin_user_id must identify an existing user");
    const reserved = new Set(["pk", "rk", "partitionKey", "rowKey", "timestamp", "etag", "ts", "et", "__proto__", "constructor", "prototype"]);
    for (const [key, value] of Object.entries(attributes)) {
        if (reserved.has(key) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return invalid(`Invalid club attribute: ${key}`);
        if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) return invalid(`Club attribute ${key} must be a string, number or boolean`);
    }
    if (typeof image !== "string" || image.length > Math.ceil(maxImageBytes / 3) * 4 + 32) return invalid("image must be a Base64 512x512 JPEG of at most 2 MB");
    const encoded = image.replace(/^data:image\/jpe?g;base64,/i, "");
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return invalid("image must be valid Base64 JPEG data");
    const jpeg = Buffer.from(encoded, "base64");
    if (!jpeg.length || jpeg.length > maxImageBytes || jpeg.toString("base64") !== encoded) return invalid("image must be a Base64 512x512 JPEG of at most 2 MB");

    try { await client.getEntity("user", admin_user_id); }
    catch (error: any) {
        if (error?.statusCode === 404) return { status: 404, jsonBody: { success: false, message: "Admin user not found" } };
        throw error;
    }
    for await (const row of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${"club"} and url eq ${hostname}` } })) {
        return { status: 409, jsonBody: { success: false, message: "A club already uses this hostname", subject: row.rowKey } };
    }

    let pngs: Buffer[];
    try {
        const source = sharp(jpeg, { limitInputPixels: 512 * 512, failOn: "warning" }).rotate();
        const metadata = await source.metadata();
        if (metadata.format !== "jpeg" || metadata.width !== 512 || metadata.height !== 512) return invalid("image must be a 512x512 JPEG");
        pngs = await Promise.all([180, 192, 512].map(size => source.clone().resize(size, size).png().toBuffer()));
    } catch { return invalid("image must be a valid, complete 512x512 JPEG"); }

    const clubId = doNewGuid("club");
    const assets = [
        { name: `${clubId}.jpg`, content: jpeg },
        ...[180, 192, 512].map((size, index) => ({ name: `${clubId}_${size}.png`, content: pngs[index] }))
    ];
    try {
        // Upload before publishing the graph so a visible club has all its icons.
        for (const asset of assets) await doAssetToPublic(asset.content, asset.name);
        await doUpsertEntity("club", clubId, { ...attributes, name: name.trim(), url: hostname });
        await doUpsertRelation(clubId, admin_user_id, { is_admin: true });
    } catch {
        // These IDs are new: cleanup cannot remove an existing club or user's entity.
        await Promise.allSettled([
            ...assets.map(asset => doAssetFromPublic(asset.name)),
            ...[["club", clubId], [clubId, admin_user_id], [admin_user_id, clubId]].map(async ([pk, rk]) => {
                try { await client.deleteEntity(pk, rk); } catch (error: any) { if (error?.statusCode !== 404) throw error; }
            })
        ]);
        context.error("Club creation failed before publication", clubId);
        return { status: 500, jsonBody: { success: false, message: "Club creation failed", subject: clubId } };
    }
    try { await doGuidsToPublic(); }
    catch {
        context.error("Club created but public graph export failed", clubId);
        return { status: 503, jsonBody: { success: false, message: "Club created, but public graph export failed; republish the graph before retrying creation", subject: clubId, data: { club_id: clubId, created: true } } };
    }
    return { status: 201, jsonBody: { success: true, message: `Okay, club ${name.trim()} created`, subject: clubId, data: { club_id: clubId, admin_user_id, assets: assets.map(asset => asset.name) } } };
}

app.http("clubCreate", { methods: ["POST"], route: "club/create", authLevel: "anonymous", handler: clubCreate });
