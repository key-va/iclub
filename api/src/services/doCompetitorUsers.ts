import { TableClient, odata } from "@azure/data-tables";

// Pair membership is immutable. Resolve competitors to real users for auth and push fan-out.
export async function doCompetitorUsers(client: TableClient, competitorId: string): Promise<string[]> {
    if (competitorId.startsWith("user_")) return [competitorId];
    if (!competitorId.startsWith("pair_")) return [];
    const users: string[] = [];
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${competitorId}` }
    })) {
        if (row.rowKey?.startsWith("user_") && row.role === "member") users.push(row.rowKey);
    }
    return [...new Set(users)];
}
