import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { doClubForOrigin } from "../services/doClubForOrigin";
import { doSendPush } from "../services/doSendPush";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const maxImageBytes = 1024 * 1024;

// Rules for the ladder settings. Keep in step with app/src/lib/strings.ts, which holds the labels and descriptions.
type SettingRule =
    | { default: string; values: string[] }
    | { default: number; min: number; max: number };

const settingRules: Record<string, SettingRule> = {
    format: { default: "singles", values: ["singles", "doubles"] },
    match_format: { default: "super_set", values: ["super_set", "best_of_three", "fast_four"] },
    ladder_system: {
        default: "win_points",
        values: ["win_points", "half_rank", "static_range_1", "static_range_3", "static_range_6"]
    },
    cool_period: { default: 2, min: 0, max: 9 },
    play_period: { default: 9, min: 1, max: 28 }
};

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

export async function ladderCreate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: Record<string, unknown>;
    };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const { caller_id, device_id, signature, data } = body ?? {};

    if (typeof caller_id !== "string" || !caller_id || (!device_id && !caller_id.startsWith("bot_")) || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id and signature are required; user callers also require device_id" } };
    }

    // 1. Verify the request signature
    try {
        await doSignatureVerification(
            { callerId: caller_id, deviceId: device_id, url: request.url, signature },
            context
        );
    } catch (err) {
        return { status: 401, jsonBody: { success: false, message: err instanceof Error ? err.message : "Unauthorised" } };
    }

    // 2. Validate the name and settings
    const { name: rawName, image: rawImage, club_id: rawClubId, ...rawSettings } = data ?? {};
    const name = typeof rawName === "string" ? rawName.trim() : "";

    if (!name) {
        return { status: 400, jsonBody: { success: false, message: "name is required" } };
    }

    // Optional ladder image: a Base64 JPEG (raw or as a data URL)
    let image: Buffer | undefined;

    if (rawImage !== undefined) {
        const invalid = { status: 400, jsonBody: { success: false, message: "image must be a JPEG of 1MB or less" } };

        if (typeof rawImage !== "string") return invalid;

        image = Buffer.from(rawImage.replace(/^data:image\/jpe?g;base64,/i, ""), "base64");

        const isJpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;

        if (image.length === 0 || image.length > maxImageBytes || !isJpeg) return invalid;
    }

    for (const key of Object.keys(rawSettings)) {
        if (!(key in settingRules)) {
            return { status: 400, jsonBody: { success: false, message: `${key} is not a ladder setting` } };
        }
    }

    const settings: Record<string, string | number> = {};

    for (const [key, rule] of Object.entries(settingRules)) {
        const value = rawSettings[key] ?? rule.default;

        if ("values" in rule) {
            if (typeof value !== "string" || !rule.values.includes(value)) {
                return { status: 400, jsonBody: { success: false, message: `${key} must be one of ${rule.values.join(", ")}` } };
            }
        } else if (typeof value !== "number" || !Number.isInteger(value) || value < rule.min || value > rule.max) {
            return { status: 400, jsonBody: { success: false, message: `${key} must be a whole number from ${rule.min} to ${rule.max}` } };
        }

        settings[key] = value;
    }

    // Hostname branding also owns club approval context; never trust a submitted club ID.
    const brand = await doClubForOrigin(request.headers.get("origin") ?? "");
    if (!brand) return { status: 400, jsonBody: { success: false, message: "Open your club website to create a ladder" } };
    const clubId = brand.clubId;

    const ladderId = doNewGuid("ladder");

    let ladderImage: string | Buffer | { publicName: string } = image ?? "icon-00.jpg";
    if (!image) {
        if (brand) ladderImage = { publicName: `${brand.clubId}.jpg` };
    }
    try { await doAssetToPublic(ladderImage, `${ladderId}.jpg`); }
    catch (error: any) {
        if (typeof ladderImage === "object" && !Buffer.isBuffer(ladderImage) && error?.statusCode === 404) {
            context.warn("Origin club icon is missing; using the default ladder icon.");
            await doAssetToPublic("icon-00.jpg", `${ladderId}.jpg`);
        } else throw error;
    }

    await doUpsertEntity("ladder", ladderId, { name, ...settings, state: "pending" });
    await doUpsertRelation(ladderId, clubId);
    await doUpsertRelation(ladderId, caller_id, { is_admin: true });

    // 4. Publish
    await doGuidsToPublic();

    // Ask the club admins to approve the new ladder
    const clubAdmins: string[] = [];

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${clubId}` }
    })) {
        if (relation.is_admin === true && (relation.rowKey as string).startsWith("user_")) {
            clubAdmins.push(relation.rowKey as string);
        }
    }

    context.log(`Club ${clubId} admins to notify: ${clubAdmins.length}`);

    if (clubAdmins.length > 0) {
        const sent = await doSendPush({
            userIds: clubAdmins,
            exceptUserId: caller_id,
            heading: name,
            content: "New ladder pending approval",
            path: `ladder/${ladderId}`,
            collapseId: ladderId
        }, context);

        context.log(`Push to club admins ${sent ? "sent" : "not sent"}`);
    }

    context.log(`Created ladder ${ladderId} for ${caller_id}`);

    // 5. Respond
    return {
        status: 201,
        jsonBody: {
            success: true,
            message: `Okay, ladder ${name} created`,
            subject: ladderId,
            data: { ladder_id: ladderId }
        }
    };
}

app.http("ladderCreate", {
    methods: ["POST"],
    route: "ladder/create",
    authLevel: "anonymous",
    handler: ladderCreate
});
