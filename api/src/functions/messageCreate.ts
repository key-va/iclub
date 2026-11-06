import { doCompetitorUsers } from "../services/doCompetitorUsers";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doPostMessage } from "../services/doPostMessage";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doSendPush } from "../services/doSendPush";

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
        data?: { match_id?: unknown; text?: unknown };
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

    const matchId = typeof data?.match_id === "string" ? data.match_id : "";

    if (!matchId) {
        return { status: 400, jsonBody: { success: false, message: "match_id is required" } };
    }

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

    // 2. Any signed-in user can post on any existing match, whatever its state
    const match = await getRow("match", matchId);

    if (!match) {
        return { status: 404, jsonBody: { success: false, message: "Match not found" } };
    }

    const players: string[] = [];

    for await (const relation of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${matchId}` }
    })) {
        if (relation.role === "challenger" || relation.role === "defender") players.push(...await doCompetitorUsers(guidsClient, relation.rowKey as string));
    }

    // 3. Store the message: the text is the entity name, related to its sender and to the match
    const sender = await getRow("user", caller_id);
    const messageId = await doPostMessage({ matchId, text, senderId: caller_id });

    await doGuidsToPublic();

    await doSendPush({
        userIds: players,
        exceptUserId: caller_id,
        heading: `${match.name}`,
        content: `${sender?.name ?? "A player"}: ${text}`,
        path: `match/${matchId}`,
        collapseId: matchId
    }, context);

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
