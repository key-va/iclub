import { doCompetitorUsers } from "../services/doCompetitorUsers";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doPostMessage } from "../services/doPostMessage";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doSendPush } from "../services/doSendPush";
import { isTeamMember } from "../services/teamRelations";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

const maxLength = 500;

// Letters, marks, numbers, punctuation, symbols (which include emoji) and plain spaces; the zero width joiner and
// variation selector are what join emoji sequences. No line breaks, tabs or other control characters.
const allowedText = /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}\u200d\ufe0f]+$/u;

async function getRow(pk: string, rk: string): Promise<Record<string, unknown> | undefined> {
    try {
        return await guidsClient.getEntity(pk, rk);
    } catch (err: any) {
        if (err?.statusCode === 404) return undefined;
        throw err;
    }
}

export async function messageCreate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

        let body: {
        caller_id?: string;
        device_id?: string;
        signature?: string;
        data?: { match_id?: unknown; round_id?: unknown; group_id?: unknown; text?: unknown };
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

    const targets = [data?.match_id, data?.round_id, data?.group_id].filter(value => value !== undefined);
    if (targets.length !== 1 || typeof targets[0] !== "string" || !targets[0]) {
        return { status: 400, jsonBody: { success: false, message: "Choose exactly one match_id, round_id or group_id" } };
    }
    const parentType = data?.group_id !== undefined ? "group" : data?.round_id !== undefined ? "round" : "match";
    const isRound = parentType === "round";
    const isGroup = parentType === "group";
    const matchId = targets[0];

    const text = typeof data?.text === "string" ? data.text.trim().replace(/\s+/g, " ") : "";

    if (text === "") {
        return { status: 400, jsonBody: { success: false, message: "A message is required" } };
    }

    if (text.length > maxLength) {
        return { status: 400, jsonBody: { success: false, message: `A message can be at most ${maxLength} characters` } };
    }

    if (!allowedText.test(text)) {
        return { status: 400, jsonBody: { success: false, message: "A message can only contain text, punctuation and emojis" } };
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

    // 2. Any signed-in user can post on an existing match, round or group.
    const match = await getRow(parentType, matchId);

    if (!match) {
        return { status: 404, jsonBody: { success: false, message: "Match, round or group not found" } };
    }

    const players: string[] = [];
    const teams: string[] = [];

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${matchId}` }
    })) {
        if (isRound && relation.rowKey.startsWith("team_")) teams.push(relation.rowKey);
        if (isGroup && relation.rowKey.startsWith("user_") && relation.is_participant === true) players.push(relation.rowKey);
        if (!isRound && !isGroup && (relation.role === "challenger" || relation.role === "defender")) players.push(...await doCompetitorUsers(guidsClient, relation.rowKey as string));
    }
    if (isRound) {
        if (teams.length !== 1) {
            return { status: 409, jsonBody: { success: false, message: "Round must belong to exactly one team" } };
        }
        for await (const relation of guidsClient.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${teams[0]}` }
        })) {
            if (relation.rowKey.startsWith("user_") && isTeamMember(relation)) players.push(relation.rowKey);
        }
    }

    // 3. Store the message with mirrored relations to its sender and parent entity.
    const sender = await getRow("user", caller_id);
    if (isGroup && (!caller_id.startsWith("user_") || !sender)) {
        return { status: 403, jsonBody: { success: false, message: "A user account is required" } };
    }
    const messageId = await doPostMessage({ matchId, text, senderId: caller_id });

    await doGuidsToPublic();

    try {
        await doSendPush({
            userIds: players,
            ...(isGroup ? {} : { exceptUserId: caller_id }),
            heading: `${match.name}`,
            content: `${sender?.name ?? "A player"}: ${text}`,
            path: `${parentType}/${matchId}`,
            collapseId: matchId
        }, context);
    } catch (error) {
        if (!isGroup) throw error;
        context.warn("Group message push delivery failed", error);
    }

    context.log(`Message ${messageId} sent on match ${matchId} by ${caller_id}`);

    return {
        status: 201,
        jsonBody: {
            success: true,
            message: "Okay, message sent",
            data: { message_id: messageId }
        }
    };
}

app.http("messageCreate", {
    methods: ["POST"],
    route: "message/create",
    authLevel: "anonymous",
    handler: messageCreate
});
