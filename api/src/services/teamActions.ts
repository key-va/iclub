import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { resourceName, resourceSuffix } from "../stores/resourceNames";
import { doSignatureVerification } from "./doSignatureVerification";
import { doSendPush } from "./doSendPush";
import { teamContext } from "./teamRelations";

export const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);
export const reply = (
    status: number,
    message: string,
    data?: object,
    subject?: string,
): HttpResponseInit & { status: number } => ({
    status,
    jsonBody: {
        success: status < 400,
        message,
        ...(data ? { data } : {}),
        ...(subject ? { subject } : {}),
    },
});
export async function get(pk: string, rk: string) {
    try {
        return await client.getEntity(pk, rk);
    } catch (e: any) {
        if (e.statusCode === 404) return undefined;
        throw e;
    }
}
export async function relations(id: string) {
    const rows = [];
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${id}` },
    }))
        rows.push(row);
    return rows;
}
export async function push(
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
export async function locked<T>(teamId: string, action: () => Promise<T>): Promise<T> {
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
export async function teamRequest(request: HttpRequest, context: InvocationContext, signed = true) {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return reply(400, "Invalid JSON payload");
    }
    const { caller_id, device_id, signature, data = {} } = body ?? {};
    if (!data || typeof data !== "object" || Array.isArray(data))
        return reply(400, "Invalid data");
    if (signed) {
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
    return { caller_id, data };
}

export async function runTeamOperation(context: InvocationContext, operation: () => Promise<HttpResponseInit>) {
    try {
        return await operation();
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

type TeamActionInput = {
    teamId: string;
    caller_id: string;
    data: Record<string, unknown>;
    graph: Awaited<ReturnType<typeof teamContext>>;
    team: Awaited<ReturnType<typeof teamContext>>["team"];
    mine: Awaited<ReturnType<typeof get>>;
};

export async function withTeam(
    request: HttpRequest, context: InvocationContext,
    operation: (input: TeamActionInput) => Promise<HttpResponseInit>,
) {
    const input = await teamRequest(request, context);
    if ("status" in input) return input;
    const { caller_id, data } = input;
    return runTeamOperation(context, async () => {
        const teamId = request.params.team_id ?? data.team_id;
        if (typeof teamId !== "string" || !teamId.startsWith("team_"))
            return reply(400, "team_id is required");
        if (!(await get("team", teamId))) return reply(404, "Team not found");
        return locked(teamId, async () => {
            const graph = await teamContext(teamId);
            const mine = await get(teamId, caller_id);
            return operation({ teamId, caller_id, data, graph, team: graph.team, mine });
        });
    });
}
