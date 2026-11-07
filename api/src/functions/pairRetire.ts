import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { doSignatureVerification } from "../services/doSignatureVerification";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doCompleteMatch } from "../services/doCompleteMatch";
import { doCompetitorUsers } from "../services/doCompetitorUsers";
import { doSendPush } from "../services/doSendPush";
import { resourceName, resourceSuffix } from "../stores/resourceNames";

const client = new TableClient(`https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`, "guids", new DefaultAzureCredential());
type Row = Record<string, unknown>;
async function row(pk: string, rk: string): Promise<Row | undefined> {
    try { return await client.getEntity(pk, rk); }
    catch (err: any) { if (err?.statusCode === 404) return undefined; throw err; }
}
function attributes(row: Row): Row {
    const { partitionKey, rowKey, timestamp, etag, ...rest } = row;
    return rest;
}

export async function pairRetire(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const pairId = request.params.pair_id;
    let body: { caller_id?: string; device_id?: string; signature?: string };
    try { body = await request.json() as typeof body; }
    catch { return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } }; }
    const { caller_id, device_id, signature } = body ?? {};
    if (!caller_id || !device_id || !signature || !pairId?.startsWith("pair_")) {
        return { status: 400, jsonBody: { success: false, message: "pair_id, caller_id, device_id and signature are required" } };
    }
    try {
        await doSignatureVerification({ callerId: caller_id, deviceId: device_id, url: request.url, signature }, context);
    } catch (err) {
        return { status: 401, jsonBody: { success: false, message: err instanceof Error ? err.message : "Unauthorised" } };
    }
    if (!await row("pair", pairId)) return { status: 404, jsonBody: { success: false, message: "Pair not found" } };
    const links = [];
    for await (const link of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${pairId}` } })) links.push(link);
    const ladderLink = links.find(link => link.rowKey?.startsWith("ladder_"));
    if (!ladderLink) return { status: 409, jsonBody: { success: false, message: "Pair has no ladder" } };
    const ladderId = ladderLink.rowKey!;
    const users = await doCompetitorUsers(client, pairId);
    if (!users.includes(caller_id) && (await row(ladderId, caller_id))?.is_admin !== true) {
        return { status: 403, jsonBody: { success: false, message: "Only a pair member or ladder admin can retire the pair" } };
    }
    if (ladderLink.is_participant !== true) return { status: 409, jsonBody: { success: false, message: "Pair is already retired" } };
    // Finish every unresolved match before removing the ranked competitor; never delete history or membership.
    for (const link of links.filter(link => link.rowKey?.startsWith("match_"))) {
        const matchId = link.rowKey!;
        const match = await row("match", matchId);
        if (match?.state !== "pending" && match?.state !== "active") continue;
        const result = await doCompleteMatch({ matchId, forfeiterId: pairId }, context);
        if (!result.ok) return { status: result.status, jsonBody: { success: false, message: result.message } };
        await doSendPush({ userIds: result.userIds!, exceptUserId: caller_id, heading: result.matchName!,
            content: "Pair retired; match forfeited", path: `match/${matchId}`, collapseId: matchId }, context);
    }
    const current = await row(ladderId, pairId);
    const { rank, ...retired } = attributes(current!);
    await doUpsertRelation(ladderId, pairId, { ...retired, is_participant: false, state: "retired" });
    const standings = [];
    for await (const link of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${ladderId}` } })) {
        if (link.rowKey?.startsWith("pair_") && link.is_participant === true && link.rowKey !== pairId) standings.push(link);
    }
    standings.sort((a, b) => Number(a.rank) - Number(b.rank));
    for (const [index, link] of standings.entries()) {
        if (link.rank !== index + 1) await doUpsertRelation(ladderId, link.rowKey!, { ...attributes(link), rank: index + 1 });
    }
    for (const userId of users) {
        const { rank, points, ...membership } = attributes(await row(ladderId, userId) ?? {});
        await doUpsertRelation(ladderId, userId, { ...membership, is_participant: false, state: "pending" });
    }
    await doGuidsToPublic();
    await doSendPush({ userIds: users, exceptUserId: caller_id, heading: "Pair retired",
        content: "You are waiting to be paired again", path: `ladder/${ladderId}`, collapseId: pairId }, context);
    return { status: 200, jsonBody: { success: true, message: "Okay, pair retired and both users returned to pending", subject: ladderId } };
}
app.http("pairRetire", { methods: ["POST"], route: "pair/{pair_id}/retire", authLevel: "anonymous", handler: pairRetire });
