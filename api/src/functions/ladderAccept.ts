import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doSendPush } from "../services/doSendPush";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

async function getRelation(a: string, b: string): Promise<Record<string, unknown> | undefined> {
    try {
        return await guidsClient.getEntity(a, b);
    } catch (err: any) {
        if (err?.statusCode === 404) return undefined;
        throw err;
    }
}

export async function ladderAccept(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const ladderId = request.params.ladder_id;

    let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: { user_id?: string; user_ids?: string[] };
    };

    try {
        body = await request.json() as typeof body;
    } catch {
        return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } };
    }

    const { caller_id, device_id, signature, data } = body ?? {};
    const userId = data?.user_id;

    if (!caller_id || !device_id || !signature) {
        return { status: 400, jsonBody: { success: false, message: "caller_id, device_id and signature are required" } };
    }

    if (typeof userId !== "string" && !Array.isArray(data?.user_ids)) {
        return { status: 400, jsonBody: { success: false, message: "user_id or user_ids is required" } };
    }

    if (userId !== undefined && (typeof userId !== "string" || !userId.startsWith("user_"))) {
        return { status: 400, jsonBody: { success: false, message: "user_id is required" } };
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

    // 2. Fetch the ladder
    let ladder: Record<string, unknown>;

    try {
        ladder = await guidsClient.getEntity("ladder", ladderId);
    } catch (err: any) {
        if (err?.statusCode === 404) {
            return { status: 404, jsonBody: { success: false, message: "Ladder not found" } };
        }
        throw err;
    }

    // 3. Only a ladder admin may accept a player
    const callerRelation = await getRelation(ladderId, caller_id);

    if (callerRelation?.is_admin !== true) {
        return { status: 403, jsonBody: { success: false, message: "Only a ladder admin can accept a player" } };
    }

    if (ladder.format === "doubles") {
        const ids = data?.user_ids;
        if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1] ||
            ids.some(id => typeof id !== "string" || !id.startsWith("user_"))) {
            return { status: 400, jsonBody: { success: false, message: "Doubles requires two distinct user_ids" } };
        }

        const users = await Promise.all(ids.map(async id => {
            try { return await guidsClient.getEntity("user", id); }
            catch (err: any) { if (err?.statusCode === 404) return undefined; throw err; }
        }));
        if (users.some(user => !user)) {
            return { status: 404, jsonBody: { success: false, message: "User not found" } };
        }
        const memberships = await Promise.all(ids.map(id => getRelation(ladderId, id)));
        if (memberships.some(r => r?.state !== "pending" || r?.is_participant === true)) {
            return { status: 409, jsonBody: { success: false, message: "Both users must be pending" } };
        }

        // Do not pair a user who is already in another active pair on this ladder.
        let lastRank = 0;
        for await (const relation of guidsClient.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
        })) {
            if (relation.rowKey?.startsWith("pair_") && relation.is_participant === true) {
                if (typeof relation.rank === "number") lastRank = Math.max(lastRank, relation.rank);
                const pairId = relation.rowKey;
                for (const id of ids) {
                    if (await getRelation(pairId, id)) {
                        return { status: 409, jsonBody: { success: false, message: "A user is already paired on this ladder" } };
                    }
                }
            }
        }

        const ordered = ids.map((id, i) => ({ id, user: users[i]! }))
            .sort((a, b) => a.id.localeCompare(b.id));
        const firstName = (name: unknown) => String(name || "Player").trim().split(/\\s+/)[0];
        const name = ordered.map(p => firstName(p.user.name)).join(" and ");
        const pairId = doNewGuid("pair");
        const rank = lastRank + 1;
        const points = ladder.ladder_system === "win_points" ? rank : 0;

        await doUpsertEntity("pair", pairId, { name });
        for (const id of ids) await doUpsertRelation(pairId, id, { role: "member" });
        await doUpsertRelation(ladderId, pairId, { is_participant: true, rank, points, state: "active" });
        for (let i = 0; i < ids.length; i++) {
            const { partitionKey, rowKey, timestamp, etag, ...attributes } = memberships[i]!;
            await doUpsertRelation(ladderId, ids[i], { ...attributes, is_participant: true, state: "active" });
        }
        await doGuidsToPublic();
        await doSendPush({
            userIds: ids, heading: String(ladder.name), content: "Your doubles pair has been accepted",
            path: `ladder/${ladderId}`, collapseId: ladderId
        }, context);
        return { status: 200, jsonBody: {
            success: true, message: `Okay, ${name} accepted at rank ${rank}`,
            subject: ladderId, data: { pair_id: pairId, rank }
        } };
    }

    if (typeof userId !== "string") {
        return { status: 400, jsonBody: { success: false, message: "user_id is required for singles" } };
    }

    // 4. The player must be waiting to join
    const playerRelation = await getRelation(ladderId, userId);

    if (playerRelation?.state !== "pending" || playerRelation.is_participant === true) {
        return { status: 409, jsonBody: { success: false, message: "That player is not waiting to join" } };
    }

    // 5. Add the player at the bottom, publish and let them know
    let lastRank = 0;

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${ladderId}` }
    })) {
        if (relation.is_participant === true && typeof relation.rank === "number" && relation.rank > lastRank) {
            lastRank = relation.rank;
        }
    }

    const rank = lastRank + 1;
    const points = ladder.ladder_system === "win_points" ? rank : 0;

    // Keep existing attributes (for example is_admin) as the upsert replaces the row
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = playerRelation;

    await doUpsertRelation(ladderId, userId, { ...attributes, is_participant: true, rank, points, state: "active" });

    await doGuidsToPublic();

    await doSendPush({
        userIds: [userId],
        heading: `${ladder.name}`,
        content: "You have been accepted, go forth and play tennis",
        path: `ladder/${ladderId}`,
        collapseId: `${ladderId}`
    }, context);

    context.log(`Accepted ${userId} onto ladder ${ladderId} at rank ${rank}`);

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, player accepted at rank ${rank}`,
            subject: ladderId,
            data: { rank }
        }
    };
}

app.http("ladderAccept", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/accept",
    authLevel: "anonymous",
    handler: ladderAccept
});
