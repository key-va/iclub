import type { InvocationContext } from "@azure/functions";
import { doGuidsToPublic } from "./doGuidsToPublic";
import { doSendPush } from "./doSendPush";
import { client, reply } from "./clubEntityRequests";

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

export async function rejectJoin(
    id: string,
    entity: Row,
    userId: unknown,
    applicant: Row | undefined,
    context: InvocationContext,
    save?: (userId: string, values: Record<string, unknown>) => Promise<unknown>,
) {
    if (typeof userId !== "string" || !userId.startsWith("user_"))
        return reply(400, "A valid user_id is required");
    if (!pendingApplicant(applicant))
        return reply(409, "This player has no pending request");

    const { partitionKey, rowKey, etag, timestamp, ...attributes } = applicant;
    const values = { ...attributes, state: "left" };
    if (save) {
        await save(userId, values);
    } else {
        if (!(await updateIfCurrent(applicant, values, "Replace")))
            return reply(409, "This join request has already changed");
        await client.upsertEntity({ partitionKey: userId, rowKey: id, ...values }, "Replace");
        await doGuidsToPublic();
    }

    await sendRejection(
        id, String(entity.name), [userId],
        `your pending request was rejected, please review the ${entity.name} rules or reach out to your club admin`,
        context,
    );
    return reply(200, "Join request rejected", id);
}

export async function sendRejection(
    id: string, name: string, userIds: string[], content: string,
    context: InvocationContext, caller?: string,
) {
    try {
        await doSendPush({
            userIds, exceptUserId: caller, heading: name, content,
            path: `${id.split("_")[0]}/${id}`, collapseId: id,
        }, context);
    } catch (error) {
        context.warn("Rejection push delivery failed", error);
    }
}
