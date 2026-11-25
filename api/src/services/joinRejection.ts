import type { InvocationContext } from "@azure/functions";
import { doGuidsToPublic } from "./doGuidsToPublic";
import { doSendPush } from "./doSendPush";
import { client, get, reply } from "./clubEntityRequests";

type Row = Record<string, unknown> & {
    partitionKey?: string;
    rowKey?: string;
    etag?: string;
};

export function pendingApplicant(row: Row | undefined): row is Row {
    return row?.state === "pending" && row.is_participant !== true &&
        row.is_member !== true && row.role !== "is_member";
}

export async function updateIfCurrent(row: Row, values: Record<string, unknown>, mode: "Merge" | "Replace" = "Merge") {
    if (!row.partitionKey || !row.rowKey || !row.etag) return false;
    try {
        await client.updateEntity(
            { partitionKey: row.partitionKey, rowKey: row.rowKey, ...values },
            mode,
            { etag: row.etag },
        );
        return true;
    } catch (error: any) {
        if (error?.statusCode === 412 || error?.statusCode === 404) return false;
        throw error;
    }
}

export async function deleteIfPresent(pk: string, rk: string, etag?: string) {
    try {
        await client.deleteEntity(pk, rk, { etag });
        return true;
    } catch (error: any) {
        if (error?.statusCode === 404 || (etag && error?.statusCode === 412)) return false;
        throw error;
    }
}

export async function rejectJoin(
    id: string,
    entity: Row,
    userId: unknown,
    applicant: Row | undefined,
    context: InvocationContext,
) {
    if (typeof userId !== "string" || !userId.startsWith("user_"))
        return reply(400, "A valid user_id is required");
    if (!applicant || (applicant.state !== "rejecting" && !pendingApplicant(applicant)))
        return reply(409, "This player has no pending request");

    if (applicant.state === "pending" &&
        !(await updateIfCurrent(applicant, { state: "rejecting" })))
        return reply(409, "This join request has already changed");

    const mirror = await get(userId, id);
    const current = await get(id, userId);
    if (current?.state !== "rejecting")
        return reply(409, "This join request has already changed");

    const { partitionKey, rowKey, etag, timestamp, state, is_participant, ...attributes } = current;
    if (attributes.is_admin === true || attributes.role === "is_admin") {
        if (mirror) {
            if (!(await updateIfCurrent(mirror, attributes, "Replace")))
                return reply(409, "This join request has already changed");
        } else {
            await client.upsertEntity({ partitionKey: userId, rowKey: id, ...attributes }, "Replace");
        }
        if (!(await updateIfCurrent(current, attributes, "Replace")))
            return reply(409, "This join request has already changed");
    } else {
        // Keep the forward row until both sides can be cleared, so a retry can resume.
        if (mirror) {
            const removed = await deleteIfPresent(userId, id, mirror.etag);
            if (!removed && await get(userId, id))
                return reply(409, "This join request has already changed");
        }
        if (!(await deleteIfPresent(id, userId, current.etag)))
            return reply(409, "This join request has already changed");
    }
    await doGuidsToPublic();

    await sendRejection(
        id, String(entity.name), [userId],
        `your pending request was rejected, please review the ${entity.name} rules or reach out to your club admin`,
        context,
    );
    return reply(200, "Join request rejected", id);
}

export async function sendRejection(
    id: string, name: string, userIds: string[], content: string,
    context: InvocationContext, caller?: string, path = `${id.split("_")[0]}/${id}`,
) {
    try {
        await doSendPush({
            userIds, exceptUserId: caller, heading: name, content,
            path, collapseId: id,
        }, context);
    } catch (error) {
        context.warn("Rejection push delivery failed", error);
    }
}
