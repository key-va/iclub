import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { resourceName, resourceSuffix } from "../stores/resourceNames";
import { doUpsertRelation } from "./doUpsertRelation";

const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);
export function isTeamAdmin(
    relation: Record<string, any> | undefined,
): boolean {
    return typeof relation?.is_admin === "boolean"
        ? relation.is_admin
        : relation?.role === "is_admin"; // legacy read compatibility
}
export function isTeamMember(
    relation: Record<string, any> | undefined,
): boolean {
    return (
        isTeamAdmin(relation) ||
        relation?.is_member === true ||
        relation?.role === "is_member"
    );
}
export async function teamContext(teamId: string) {
    const team = await client.getEntity("team", teamId);
    const relations: Record<string, any>[] = [];
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${teamId}` },
    }))
        relations.push(row);
    // Prefer the team's forward rows; use surviving inverse mirrors only to repair
    // an interrupted write. An explicit forward admin revocation stays authoritative.
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`RowKey eq ${teamId}` },
    })) {
        if (
            row.rowKey !== teamId ||
            !/^(club|user)_/.test(row.partitionKey) ||
            relations.some((relation) => relation.rowKey === row.partitionKey)
        )
            continue;
        const { partitionKey, rowKey, ...attributes } = row;
        relations.push({
            ...attributes,
            partitionKey: teamId,
            rowKey: partitionKey,
        });
    }
    const clubs = relations.filter((row) => row.rowKey.startsWith("club_"));
    if (clubs.length > 1) throw Error("A team must belong to exactly one club");
    const clubId =
        clubs[0]?.rowKey ??
        (typeof team.club_id === "string" ? team.club_id : undefined);
    const administrators = relations
        .filter((row) => row.rowKey.startsWith("user_") && isTeamAdmin(row))
        .map((row) => row.rowKey as string);
    // Only repair a legacy requester when no authoritative admin relation exists.
    const legacyRequester = relations.find(
        (row) => row.rowKey === team.requested_by,
    );
    const canRepairRequester =
        !legacyRequester ||
        (legacyRequester.state === "pending" &&
            legacyRequester.role === undefined &&
            legacyRequester.is_admin === undefined);
    if (
        !administrators.length &&
        canRepairRequester &&
        typeof team.requested_by === "string" &&
        team.requested_by.startsWith("user_")
    )
        administrators.push(team.requested_by);
    return { teamId, team, relations, clubId, administrators };
}
export async function migrateTeamRelations(
    graph: Awaited<ReturnType<typeof teamContext>>,
) {
    const { teamId, relations, clubId, administrators } = graph;
    if (clubId) {
        await client.getEntity("club", clubId);
        const { partitionKey, rowKey, timestamp, etag, ...attributes } =
            relations.find((row) => row.rowKey === clubId) ?? {};
        await doUpsertRelation(teamId, clubId, attributes);
    }
    for (const id of administrators) {
        await client.getEntity("user", id);
        const {
            partitionKey,
            rowKey,
            timestamp,
            etag,
            role,
            state,
            ...attributes
        } = relations.find((row) => row.rowKey === id) ?? {};
        await doUpsertRelation(teamId, id, {
            ...attributes,
            ...(role && role !== "is_admin" ? { role } : {}),
            ...(state && state !== "pending" ? { state } : {}),
            is_admin: true,
            is_member: true,
        });
    }
}
