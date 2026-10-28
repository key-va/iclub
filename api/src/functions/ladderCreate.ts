import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { ladderSettings, ladderSettingDefaults } from "../stores/strings";

const maxImageBytes = 1024 * 1024;

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

    if (!caller_id || !device_id || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id, device_id and signature are required" } };
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
    const { name: rawName, image: rawImage, ...rawSettings } = data ?? {};
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
        if (!(key in ladderSettings)) {
            return { status: 400, jsonBody: { success: false, message: `${key} is not a ladder setting` } };
        }
    }

    const settings: Record<string, string | number> = { ...ladderSettingDefaults };

    for (const [key, setting] of Object.entries(ladderSettings)) {
        const value = rawSettings[key];

        if (value === undefined) continue;

        if (setting.type === "enum") {
            if (typeof value !== "string" || !(value in setting.values)) {
                return { status: 400, jsonBody: { success: false, message: `${key} must be one of ${Object.keys(setting.values).join(", ")}` } };
            }
        } else if (typeof value !== "number" || !Number.isInteger(value) || value < setting.min || value > setting.max) {
            return { status: 400, jsonBody: { success: false, message: `${key} must be a whole number from ${setting.min} to ${setting.max}` } };
        }

        settings[key] = value;
    }

    // 3. Create the ladder and make the caller its admin
    const ladderId = doNewGuid("ladder");

    await doUpsertEntity("ladder", ladderId, { name, ...settings });
    await doUpsertRelation(ladderId, caller_id, { is_admin: true });
    await doAssetToPublic(image ?? "user-00.jpg", `${ladderId}.jpg`);

    // 4. Publish
    await doGuidsToPublic();

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
