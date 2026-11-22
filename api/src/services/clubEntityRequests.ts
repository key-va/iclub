import { defaultMatchFormat, isMatchFormat } from "./matchFormats";
import {
    HttpRequest,
    HttpResponseInit,
    InvocationContext,
} from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { resourceName, resourceSuffix } from "../stores/resourceNames";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doClubForOrigin } from "../services/doClubForOrigin";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { doSendPush } from "../services/doSendPush";

export const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);
export const reply = (
    status: number,
    message: string,
    subject?: string,
): HttpResponseInit & { status: number } => ({
    status,
    jsonBody: {
        success: status < 400,
        message,
        ...(subject ? { subject } : {}),
    },
});
export async function get(pk: string, rk: string) {
    try {
        return await client.getEntity(pk, rk);
    } catch (error: any) {
        if (error?.statusCode === 404) return undefined;
        throw error;
    }
}
async function relations(id: string) {
    const rows = [];
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${id}` },
    }))
        rows.push(row);
    return rows;
}

type EntityType = "group" | "comp";

export async function signedEntityRequest(request: HttpRequest, context: InvocationContext, type: EntityType) {
    let body;
    try {
        body = (await request.json()) as {
            caller_id?: string;
            device_id?: string;
            signature?: string;
            data?: Record<string, unknown>;
        };
    } catch {
        return reply(400, "Invalid JSON payload");
    }
    const { caller_id, device_id, signature, data = {} } = body ?? {};
    if (
        typeof caller_id !== "string" ||
        !caller_id ||
        typeof device_id !== "string" ||
        !device_id ||
        typeof signature !== "string" ||
        !signature
    )
        return reply(400, "caller_id, device_id and signature are required");
    try {
        await doSignatureVerification(
            {
                callerId: caller_id,
                deviceId: device_id,
                url: request.url,
                signature,
            },
            context,
        );
    } catch (error) {
        return reply(
            401,
            error instanceof Error ? error.message : "Unauthorised",
        );
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
        return reply(400, "data must be an object");
    const caller = caller_id.startsWith("user_")
        ? await get("user", caller_id)
        : undefined;
    if (!caller) return reply(403, "A user account is required");
    // Notification failures never turn an already-persisted action into a failed request.
    async function notify(
        userIds: string[],
        heading: string,
        content: string,
        id: string,
    ) {
        try {
            await doSendPush(
                {
                    userIds,
                    exceptUserId: caller_id,
                    heading,
                    content,
                    path: `${type}/${id}`,
                    collapseId: id,
                },
                context,
            );
        } catch (error) {
            context.warn("Group push delivery failed", error);
        }
    }
    return { caller, caller_id, data, notify };
}

export function entityEdits(data: Record<string, unknown>, creating: boolean, isCompCreate = false) {
    let name: string | undefined;
    let image: Buffer | undefined;
    const fields = isCompCreate ? ["name", "image", "comp_system", "competition_type", "format", "match_format"] : ["name", "image"];
    if (Object.keys(data).some((key) => !fields.includes(key)))
        return reply(400, isCompCreate ? "Unexpected competition fields" : "Only name and image can be supplied");
    if (creating || data.name !== undefined) {
        name = typeof data.name === "string" ? data.name.trim() : "";
        if (!name) return reply(400, "name is required");
    }
    if (data.image !== undefined) {
        if (typeof data.image !== "string")
            return reply(400, "image must be a JPEG of 1MB or less");
        image = Buffer.from(
            data.image.replace(/^data:image\/jpe?g;base64,/i, ""),
            "base64",
        );
        if (
            image.length === 0 ||
            image.length > 1024 * 1024 ||
            image[0] !== 0xff ||
            image[1] !== 0xd8 ||
            image[2] !== 0xff
        )
            return reply(400, "image must be a JPEG of 1MB or less");
    }
    if (!creating && name === undefined && !image)
        return reply(400, "Supply a name or image to update");
    return { name, image };
}

export async function createEntityRequest(request: HttpRequest, context: InvocationContext, type: EntityType) {
    const signed = await signedEntityRequest(request, context, type);
    if ("status" in signed) return signed;
    const { data, caller, caller_id, notify } = signed;
    if (type === "comp" && (data.comp_system ?? data.competition_type) !== "elimination")
        return reply(400, "Choose a supported competition type");
    if (type === "comp" && (
        (data.format !== undefined && data.format !== "singles" && data.format !== "doubles") ||
        (data.match_format !== undefined && !isMatchFormat(data.match_format))
    )) return reply(400, "Choose a supported format and match format");
    const edits = entityEdits(data, true, type === "comp");
    if ("status" in edits) return edits;
    const { name, image } = edits;
    const club = await doClubForOrigin(request.headers.get("origin") ?? "");
    if (!club)
        return reply(400, `Open your club website to create a ${type === "comp" ? "competition" : type}`);
    const id = doNewGuid(type);
    if (image) await doAssetToPublic(image, `${id}.jpg`);
    else {
        try {
            await doAssetToPublic(
                { publicName: `${club.clubId}.jpg` },
                `${id}.jpg`,
            );
        } catch (error: any) {
            if (error?.statusCode !== 404) throw error;
            await doAssetToPublic("icon-00.jpg", `${id}.jpg`);
        }
    }
    await doUpsertRelation(id, club.clubId);
    await doUpsertRelation(id, caller_id, {
        is_admin: true,
        is_participant: type === "group",
    });
    await doUpsertEntity(type, id, {
        name, state: "pending",
        ...(type === "comp" ? { comp_system: data.comp_system ?? data.competition_type, format: data.format ?? "singles", match_format: data.match_format ?? defaultMatchFormat } : {}),
    });
    await doGuidsToPublic();
    const admins = (await relations(club.clubId))
        .filter(
            (row) =>
                row.rowKey.startsWith("user_") && row.is_admin === true,
        )
        .map((row) => row.rowKey);
    await notify(
        admins,
        name!,
        `${caller.name || "A player"} has requested to create this ${type === "comp" ? "competition" : type}`,
        id,
    );
    return reply(201, `${type === "group" ? "Group" : "Competition"} requested; waiting for club approval`, id);
}

type SignedEntityRequest = Exclude<Awaited<ReturnType<typeof signedEntityRequest>>, HttpResponseInit>;

export async function loadEntity(
    request: HttpRequest,
    type: EntityType,
    signed: SignedEntityRequest,
) {
    const { caller_id } = signed;
    const id = request.params[`${type}_id`];
    if (typeof id !== "string" || !id.startsWith(`${type}_`))
        return reply(400, `${type}_id is required`);
    const group = await get(type, id);
    if (!group) return reply(404, `${type === "group" ? "Group" : "Competition"} not found`);
    const links = await relations(id);
    const mine = links.find((row) => row.rowKey === caller_id);
    return { ...signed, id, group, links, mine };
}

async function loadEntityRequest(request: HttpRequest, context: InvocationContext, type: EntityType) {
    const signed = await signedEntityRequest(request, context, type);
    return "status" in signed ? signed : loadEntity(request, type, signed);
}

type EntityRequest = Exclude<Awaited<ReturnType<typeof loadEntityRequest>>, HttpResponseInit>;

export async function withGroup(request: HttpRequest, context: InvocationContext, run: (input: EntityRequest) => Promise<HttpResponseInit>) {
    const input = await loadEntityRequest(request, context, "group");
    if ("status" in input) return input;
    return run(input);
}

export async function activateEntityRequest(request: HttpRequest, context: InvocationContext, type: EntityType) {
    const input = await loadEntityRequest(request, context, type);
    if ("status" in input) return input;
    const { id, group, links, caller_id, notify } = input;
    const clubs = links.filter((row) => row.rowKey.startsWith("club_"));
    if (
        clubs.length !== 1 ||
        (await get(clubs[0].rowKey, caller_id))?.is_admin !== true
    )
        return reply(403, `Only a club admin can approve the ${type}`);
    if (group.state !== "pending")
        return reply(409, `Only a pending ${type} can be approved`);
    await client.updateEntity(
        { partitionKey: type, rowKey: id, state: type === "comp" ? "open" : "active" },
        "Merge",
        { etag: group.etag },
    );
    await doGuidsToPublic();
    await notify(
        links
            .filter(
                (row) =>
                    row.rowKey.startsWith("user_") && row.is_admin === true,
            )
            .map((row) => row.rowKey),
        String(group.name),
        `Your ${type === "comp" ? "competition" : type} has been accepted and is now live`,
        id,
    );
    return reply(200, `${type === "group" ? "Group" : "Competition"} approved`, id);
}
