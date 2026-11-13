import {
    app,
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

const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);
const reply = (
    status: number,
    message: string,
    subject?: string,
): HttpResponseInit => ({
    status,
    jsonBody: {
        success: status < 400,
        message,
        ...(subject ? { subject } : {}),
    },
});
async function get(pk: string, rk: string) {
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

export async function groupAction(
    request: HttpRequest,
    context: InvocationContext,
    action = request.params.action,
): Promise<HttpResponseInit> {
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
    if (!["create", "activate", "join", "accept", "update"].includes(action))
        return reply(404, "Unknown group action");

    let image: Buffer | undefined;
    let name: string | undefined;
    if (action === "create" || action === "update") {
        if (Object.keys(data).some((key) => !["name", "image"].includes(key)))
            return reply(400, "Only name and image can be supplied");
        if (action === "create" || data.name !== undefined) {
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
        if (action === "update" && name === undefined && !image)
            return reply(400, "Supply a name or image to update");
    }
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
                    path: `group/${id}`,
                    collapseId: id,
                },
                context,
            );
        } catch (error) {
            context.warn("Group push delivery failed", error);
        }
    }
    if (action === "create") {
        const club = await doClubForOrigin(request.headers.get("origin") ?? "");
        if (!club)
            return reply(400, "Open your club website to create a group");
        const id = doNewGuid("group");
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
            is_participant: true,
        });
        await doUpsertEntity("group", id, { name, state: "pending" });
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
            `${caller.name || "A player"} has requested to create this group`,
            id,
        );
        return reply(201, "Group requested; waiting for club approval", id);
    }
    const id = request.params.group_id;
    if (typeof id !== "string" || !id.startsWith("group_"))
        return reply(400, "group_id is required");
    const group = await get("group", id);
    if (!group) return reply(404, "Group not found");
    const links = await relations(id);
    const mine = links.find((row) => row.rowKey === caller_id);
    if (action === "activate") {
        const clubs = links.filter((row) => row.rowKey.startsWith("club_"));
        if (
            clubs.length !== 1 ||
            (await get(clubs[0].rowKey, caller_id))?.is_admin !== true
        )
            return reply(403, "Only a club admin can approve the group");
        if (group.state !== "pending")
            return reply(409, "Only a pending group can be approved");
        await client.updateEntity(
            { partitionKey: "group", rowKey: id, state: "active" },
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
            "Your group has been accepted and is now live",
            id,
        );
        return reply(200, "Group approved", id);
    }
    if (action === "update") {
        if (mine?.is_admin !== true)
            return reply(403, "Only a group admin can update the group");
        if (image) await doAssetToPublic(image, `${id}.jpg`);
        if (name !== undefined)
            await client.updateEntity(
                { partitionKey: "group", rowKey: id, name },
                "Merge",
                { etag: group.etag },
            );
        await doGuidsToPublic();
        return reply(200, "Group updated", id);
    }
    if (group.state !== "active") return reply(409, "The group must be active");
    if (action === "join") {
        if (mine)
            return reply(
                409,
                "You already belong to this group or have a pending request",
            );
        await doUpsertRelation(id, caller_id, {
            state: "pending",
            is_participant: false,
        });
        await doGuidsToPublic();
        await notify(
            links
                .filter(
                    (row) =>
                        row.rowKey.startsWith("user_") && row.is_admin === true,
                )
                .map((row) => row.rowKey),
            String(group.name),
            `${caller.name || "A player"} has requested to join`,
            id,
        );
        return reply(200, "Membership requested");
    }
    if (mine?.is_admin !== true)
        return reply(403, "Only a group admin can accept a player");
    const userId = data.user_id;
    if (
        typeof userId !== "string" ||
        !userId.startsWith("user_") ||
        !(await get("user", userId))
    )
        return reply(400, "A valid user_id is required");
    const applicant = links.find((row) => row.rowKey === userId);
    if (applicant?.state !== "pending" || applicant.is_participant === true)
        return reply(409, "This player has no pending request");
    const { partitionKey, rowKey, etag, timestamp, state, ...attributes } =
        applicant;
    await doUpsertRelation(id, userId, { ...attributes, is_participant: true });
    await doGuidsToPublic();
    await notify(
        [userId],
        String(group.name),
        "Your request to join has been accepted",
        id,
    );
    return reply(200, "Player accepted");
}
app.http("groupCreate", {
    methods: ["POST"],
    route: "group/create",
    authLevel: "anonymous",
    handler: (request, context) => groupAction(request, context, "create"),
});
app.http("groupAction", {
    methods: ["POST"],
    route: "group/{group_id}/{action}",
    authLevel: "anonymous",
    handler: (request, context) => groupAction(request, context),
});
