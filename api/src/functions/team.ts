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
import { doAssetToPublic } from "../services/doAssetToPublic";
import { doClubForOrigin } from "../services/doClubForOrigin";
import { doSendPush } from "../services/doSendPush";
import {
    doEnsureRoundUsers,
    doSyncTeam,
    teamMapping,
} from "../services/doSyncTeam";
import { providerFor } from "../services/trols";
import {
    teamExternalFields,
    teamAttributes,
    externalTeamKey,
} from "../services/competitionData";
import {
    isTeamAdmin,
    isTeamMember,
    teamContext,
    migrateTeamRelations,
} from "../services/teamRelations";

const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);
const reply = (
    status: number,
    message: string,
    data?: object,
    subject?: string,
): HttpResponseInit => ({
    status,
    jsonBody: {
        success: status < 400,
        message,
        ...(data ? { data } : {}),
        ...(subject ? { subject } : {}),
    },
});
async function get(pk: string, rk: string) {
    try {
        return await client.getEntity(pk, rk);
    } catch (e: any) {
        if (e.statusCode === 404) return undefined;
        throw e;
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
async function push(
    userIds: string[],
    heading: string,
    content: string,
    path: string,
    context: InvocationContext,
) {
    try {
        await doSendPush({ userIds, heading, content, path }, context);
    } catch (error) {
        context.warn("Team push delivery failed", error);
    }
}
// Serialize mutations to the same team/round across function instances using the existing entity's ETag.
// A crashed invocation's lease expires; no new storage row or entity type is introduced.
async function locked<T>(teamId: string, action: () => Promise<T>): Promise<T> {
    const row = await client.getEntity("team", teamId);
    if (
        Math.max(
            Number(row.operation_guard) || 0,
            Number(row.operation_until) || 0,
        ) > Date.now()
    )
        throw Object.assign(Error("Team update in progress; please retry"), {
            statusCode: 409,
        });
    try {
        await client.updateEntity(
            {
                partitionKey: "team",
                rowKey: teamId,
                operation_guard: Date.now() + 180000,
            },
            "Merge",
            { etag: row.etag },
        );
    } catch (e: any) {
        if (e.statusCode === 412)
            throw Object.assign(
                Error("Team update in progress; please retry"),
                { statusCode: 409 },
            );
        throw e;
    }
    try {
        return await action();
    } finally {
        await client.updateEntity(
            { partitionKey: "team", rowKey: teamId, operation_guard: 0 },
            "Merge",
        );
    }
}
export async function teamAction(
    action: string,
    request: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return reply(400, "Invalid JSON payload");
    }
    const { caller_id, device_id, signature, data = {} } = body ?? {};
    if (!data || typeof data !== "object" || Array.isArray(data))
        return reply(400, "Invalid data");
    if (action !== "options") {
        if (
            typeof caller_id !== "string" ||
            !caller_id ||
            !signature ||
            (!device_id && !caller_id.startsWith("bot_"))
        )
            return reply(400, "Caller credentials are required");
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
        } catch {
            return reply(401, "Unauthorised");
        }
    }
    try {
        if (action === "options") {
            if (
                ["association", "competition", "section"].some(
                    (k) => data[k] !== undefined && typeof data[k] !== "string",
                )
            )
                return reply(400, "Invalid selection");
            try {
                return reply(
                    200,
                    "Competition options",
                    await providerFor("trols").options(data),
                );
            } catch (error) {
                context.warn("TROLS options failed", error);
                return reply(
                    502,
                    "Competition options could not be loaded. Please retry.",
                );
            }
        }
        if (action === "create") {
            const requester = caller_id.startsWith("user_")
                ? await get("user", caller_id)
                : undefined;
            if (!requester) return reply(403, "A user account is required");
            if (
                ["association", "competition", "section", "team"].some(
                    (k) => typeof data[k] !== "string" || !data[k],
                )
            )
                return reply(400, "Complete all competition selections");
            const brand = await doClubForOrigin(
                request.headers.get("origin") ?? "",
            );
            if (!brand)
                return reply(400, "Open your club website to request a team");
            let mapping;
            try {
                mapping = await providerFor("trols").resolve(data);
            } catch (error) {
                context.warn("TROLS selection validation failed", error);
                return reply(
                    400,
                    "The selected competition or team is no longer available",
                );
            }
            let image: Buffer | undefined;
            if (data.image !== undefined) {
                if (typeof data.image !== "string")
                    return reply(400, "Invalid team image");
                image = Buffer.from(
                    data.image.replace(/^data:image\/jpe?g;base64,/i, ""),
                    "base64",
                );
                if (
                    image.length > 1024 * 1024 ||
                    image[0] !== 255 ||
                    image[1] !== 216 ||
                    image[2] !== 255
                )
                    return reply(400, "Image must be a JPEG of 1MB or less");
            }
            // A short club-entity lease protects duplicate checks across independent API instances.
            const club = await client.getEntity("club", brand.clubId);
            if (Number(club.team_request_until) > Date.now())
                return reply(
                    409,
                    "Another team request is being saved; please retry",
                );
            try {
                await client.updateEntity(
                    {
                        partitionKey: "club",
                        rowKey: brand.clubId,
                        team_request_until: Date.now() + 60000,
                    },
                    "Merge",
                    { etag: club.etag },
                );
            } catch (e: any) {
                if (e.statusCode === 412)
                    return reply(
                        409,
                        "Another team request is being saved; please retry",
                    );
                throw e;
            }
            try {
                // Include incomplete earlier creations too: a failed relation write must not
                // allow another entity for the same external team on a retry.
                for await (const old of client.listEntities({
                    queryOptions: {
                        filter: odata`PartitionKey eq ${"team"}`,
                    },
                })) {
                    if (
                        (await teamContext(old.rowKey)).clubId ===
                            brand.clubId &&
                        [
                            "provider",
                            "association",
                            "season",
                            "section",
                            "external_team",
                        ].every((k) => teamMapping(old)[k] === mapping[k])
                    ) {
                        return reply(
                            409,
                            "This team has already been requested for your club",
                            { team_id: old.rowKey },
                            old.rowKey,
                        );
                    }
                }
                const id = doNewGuid("team");
                try {
                    await doAssetToPublic(
                        image ?? { publicName: `${brand.clubId}.jpg` },
                        `${id}.jpg`,
                    );
                } catch (e: any) {
                    if (!image && e.statusCode === 404)
                        await doAssetToPublic("icon-00.jpg", `${id}.jpg`);
                    else throw e;
                }
                await doUpsertRelation(id, brand.clubId);
                await doUpsertRelation(id, caller_id, {
                    is_admin: true,
                    is_member: true,
                });
                await doUpsertEntity("team", id, {
                    ...teamExternalFields(mapping),
                    name: mapping.name,
                    state: "pending",
                    external_key: externalTeamKey(mapping),
                    operation_guard: 0,
                });
                await doGuidsToPublic();
                await push(
                    (await relations(brand.clubId))
                        .filter(
                            (r) =>
                                r.rowKey.startsWith("user_") &&
                                r.is_admin === true,
                        )
                        .map((r) => r.rowKey),
                    mapping.name,
                    `${requester.name || "A player"} has requested to create this team`,
                    `team/${id}`,
                    context,
                );
                return reply(
                    201,
                    "Team requested; waiting for club approval",
                    undefined,
                    id,
                );
            } finally {
                await client.updateEntity(
                    {
                        partitionKey: "club",
                        rowKey: brand.clubId,
                        team_request_until: 0,
                    },
                    "Merge",
                );
            }
        }
        const teamId = request.params.team_id ?? data.team_id;
        if (typeof teamId !== "string" || !teamId.startsWith("team_"))
            return reply(400, "team_id is required");
        if (!(await get("team", teamId))) return reply(404, "Team not found");
        return await locked(teamId, async () => {
            const graph = await teamContext(teamId);
            const team = graph.team;
            const mine = await get(teamId, caller_id);
            if (action === "activate") {
                const clubAdmin = graph.clubId
                    ? await get(graph.clubId, caller_id)
                    : undefined;
                if (clubAdmin?.is_admin !== true)
                    return reply(
                        403,
                        "Only the associated club administrator can activate this team",
                    );
                if (
                    team.state !== "pending" &&
                    !(team.state === "active" && !team.last_synced)
                )
                    return reply(409, "Only a pending team can be activated");
                if (!graph.administrators.length)
                    return reply(409, "Team request has no administrator");
                // A failed external fetch leaves approval pending, with no imported records.
                let snapshot;
                try {
                    snapshot = await providerFor(
                        teamMapping(team).provider,
                    ).snapshot(teamMapping(team));
                } catch (error) {
                    context.warn("Initial team synchronisation failed", error);
                    return reply(
                        502,
                        "TROLS could not be loaded; the team is still pending. Retry approval.",
                    );
                }
                await migrateTeamRelations(graph);
                await doUpsertEntity("team", teamId, {
                    ...teamAttributes(team),
                    state: "active",
                });
                const summary = await doSyncTeam(teamId, snapshot);
                await push(
                    graph.administrators,
                    String(team.name),
                    "Your team is approved and active",
                    `team/${teamId}`,
                    context,
                );
                return reply(200, "Team activated", summary, teamId);
            }
            if (team.state !== "active")
                return reply(409, "The team must be active");
            if (action === "join") {
                const requester = caller_id.startsWith("user_")
                    ? await get("user", caller_id)
                    : undefined;
                if (!requester) return reply(403, "A user account is required");
                if (mine)
                    return reply(
                        409,
                        "You already belong to this team or have a pending request",
                    );
                await doUpsertRelation(teamId, caller_id, { state: "pending" });
                await doGuidsToPublic();
                await push(
                    (await relations(teamId))
                        .filter(isTeamAdmin)
                        .map((r) => r.rowKey),
                    String(team.name),
                    `${requester.name || "A player"} has requested to join`,
                    `team/${teamId}`,
                    context,
                );
                return reply(200, "Membership requested");
            }
            if (action === "sync" ? !isTeamMember(mine) : !isTeamAdmin(mine))
                return reply(
                    403,
                    action === "sync"
                        ? "Only approved team members can refresh data"
                        : "Only a team administrator can do this",
                );
            if (action === "accept") {
                const user = data.user_id;
                if (typeof user !== "string" || !user.startsWith("user_"))
                    return reply(400, "user_id is required");
                const membership = await get(teamId, user);
                if (membership?.role === "is_member") {
                    await doEnsureRoundUsers(teamId);
                    await doGuidsToPublic();
                    return reply(
                        200,
                        "Player already accepted; round links refreshed",
                    );
                }
                if (
                    membership?.state !== "pending" ||
                    !(await get("user", user))
                )
                    return reply(
                        409,
                        "The player must have a pending membership request",
                    );
                await doUpsertRelation(teamId, user, { role: "is_member" });
                await doEnsureRoundUsers(teamId);
                await doGuidsToPublic();
                await push(
                    [user],
                    String(team.name),
                    "Your team membership has been approved",
                    `team/${teamId}`,
                    context,
                );
                return reply(200, "Player accepted");
            }
            if (action === "sync") {
                try {
                    const summary = await doSyncTeam(teamId);
                    return reply(
                        200,
                        `Refreshed: ${summary.created} created, ${summary.updated} updated`,
                        summary,
                    );
                } catch (error) {
                    context.warn("Team synchronisation failed", error);
                    return reply(
                        502,
                        "Synchronisation failed. Refresh the page and retry; your player roles and messages are preserved.",
                    );
                }
            }
            return reply(404, "Unknown team action");
        });
    } catch (error: any) {
        context.error("Team operation failed", error);
        return reply(
            error.statusCode === 409 ? 409 : 503,
            error.statusCode === 409
                ? error.message
                : "Team update could not be completed; refresh and retry",
        );
    }
}
for (const action of [
    "options",
    "create",
    "activate",
    "join",
    "accept",
    "sync",
]) {
    app.http(`team${action}`, {
        methods: ["POST"],
        route: `team/${action}`,
        authLevel: "anonymous",
        handler: (request, context) => teamAction(action, request, context),
    });
    if (!["options", "create"].includes(action))
        app.http(`teamById${action}`, {
            methods: ["POST"],
            route: `team/{team_id}/${action}`,
            authLevel: "anonymous",
            handler: (request, context) => teamAction(action, request, context),
        });
}
export async function roundRole(
    request: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return reply(400, "Invalid JSON payload");
    }
    const { caller_id, device_id, signature, data = {} } = body ?? {};
    if (
        typeof caller_id !== "string" ||
        !caller_id ||
        !signature ||
        (!device_id && !caller_id.startsWith("bot_"))
    )
        return reply(400, "Caller credentials are required");
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
    } catch {
        return reply(401, "Unauthorised");
    }
    if (!data || typeof data !== "object") return reply(400, "Invalid data");
    const id = request.params.round_id ?? data.round_id;
    const user = data.user_id ?? caller_id;
    const role = data.role;
    if (
        typeof id !== "string" ||
        !id.startsWith("round_") ||
        typeof user !== "string" ||
        !user.startsWith("user_") ||
        !["pending", "available", "unavailable", "selected"].includes(role)
    )
        return reply(400, "Valid round_id, user_id and role are required");
    try {
        const round = await get("round", id);
        if (!round) return reply(404, "Round not found");
        const owners = (await relations(id)).filter((relation) =>
            relation.rowKey.startsWith("team_"),
        );
        if (owners.length !== 1)
            return reply(409, "Round must belong to exactly one team");
        const teamId = owners[0].rowKey;
        return await locked(teamId, async () => {
            const team = await get("team", teamId);
            if (team?.state !== "active" || !(await get(teamId, id)))
                return reply(409, "Round must belong to an active team");
            const currentRound = await get("round", id);
            if (!currentRound) return reply(404, "Round not found");
            if (
                currentRound.state === "complete" ||
                (currentRound.state === undefined &&
                    ["completed", "bye", "washout"].includes(String(currentRound.status)))
            )
                return reply(409, "A completed round cannot be changed");
            const membership = await get(teamId, user);
            const caller = await get(teamId, caller_id);
            const previous = await get(id, user);
            if (!isTeamMember(membership) || !previous)
                return reply(
                    403,
                    "Only approved team players have round roles",
                );
            const old = previous.role;
            if (role === "selected") {
                if (!isTeamAdmin(caller))
                    return reply(
                        403,
                        "Only an administrator can select a player",
                    );
                if (old !== "available" && old !== "selected")
                    return reply(409, "Only available players can be selected");
            } else if (old === "selected" && role === "available") {
                if (!isTeamAdmin(caller))
                    return reply(403, "Only an administrator can return a selected player to available");
            } else if (user !== caller_id)
                return reply(403, "You may only update your own availability");
            if (old === role) {
                await doUpsertRelation(id, user, { role });
                await doGuidsToPublic();
                return reply(200, "Role unchanged");
            }
            if (
                role !== "selected" &&
                (!["available", "unavailable"].includes(role) ||
                    !["pending", "available", "unavailable", "selected"].includes(
                        String(old),
                    ) ||
                    (old === "selected" && role !== "unavailable" && role !== "available"))
            )
                return reply(409, "This round role transition is not allowed");
            const unavailablePlayer =
                old === "selected" && role === "unavailable"
                    ? await get("user", user)
                    : undefined;
            await doUpsertRelation(id, user, { role });
            await doGuidsToPublic();
            if (old === "selected" && role === "unavailable")
                await push(
                    (await relations(teamId))
                        .filter(
                            (r) =>
                                r.rowKey.startsWith("user_") && isTeamAdmin(r),
                        )
                        .map((r) => r.rowKey),
                    `Player unavailable — ${team.name}`,
                    `${unavailablePlayer?.name || "A player"} is now unavailable for Round ${currentRound.ext_number ?? currentRound.number}. A replacement player is needed.`,
                    `round/${id}`,
                    context,
                );
            else if (role === "selected")
                await push(
                    [user],
                    String(team.name),
                    `You have been selected for Round ${currentRound.ext_number ?? currentRound.number}.`,
                    `round/${id}`,
                    context,
                );
            return reply(200, "Round role updated");
        });
    } catch (error: any) {
        context.error("Round role update failed", error);
        return reply(
            error.statusCode === 409 ? 409 : 503,
            error.statusCode === 409
                ? error.message
                : "Role update could not be completed; refresh and retry",
        );
    }
}
app.http("roundRole", {
    methods: ["POST"],
    route: "round/role",
    authLevel: "anonymous",
    handler: roundRole,
});
app.http("roundByIdRole", {
    methods: ["POST"],
    route: "round/{round_id}/role",
    authLevel: "anonymous",
    handler: roundRole,
});
