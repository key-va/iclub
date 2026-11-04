import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const guidsClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

const DAY_MS = 86400000;

export type MatchDeadlineState = "pending" | "active";

export interface DueMatch {
    matchId: string;
    name: string;
    ladderId: string;
    challengerId: string;
    defenderId: string;
}

const periodSetting = {
    pending: { key: "cool_period", defaultDays: 2 },
    active: { key: "play_period", defaultDays: 9 }
} as const;

// Matches whose deadline falls after `afterMs` and by `withinMs` from now (defaults: anything already overdue).
// A pending match must be accepted within the ladder's cool_period, an active match played within its play_period.
// A match row is rewritten on acceptance, so its storage timestamp is when it entered its current state.
export async function doFindDueMatches(
    state: MatchDeadlineState,
    { afterMs = -Infinity, withinMs = 0 }: { afterMs?: number; withinMs?: number } = {}
): Promise<DueMatch[]> {

    const { key, defaultDays } = periodSetting[state];
    const due: DueMatch[] = [];

    for await (const match of guidsClient.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${"match"} and state eq ${state}` }
    })) {
        const matchId = match.rowKey as string;

        let ladderId = "";
        let challengerId = "";
        let defenderId = "";

        for await (const relation of guidsClient.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${matchId}` }
        })) {
            const rk = relation.rowKey as string;
            if (rk.startsWith("ladder_")) ladderId = rk;
            else if (relation.role === "challenger") challengerId = rk;
            else if (relation.role === "defender") defenderId = rk;
        }

        if (!ladderId || !challengerId || !defenderId) continue;

        const ladder = await guidsClient.getEntity("ladder", ladderId).catch(() => undefined);
        const since = Date.parse(String(match.timestamp));

        if (!ladder || Number.isNaN(since)) continue;

        const deadline = since + Number(ladder[key] ?? defaultDays) * DAY_MS;

        if (deadline > Date.now() + afterMs && deadline <= Date.now() + withinMs) {
            due.push({ matchId, name: String(match.name ?? ""), ladderId, challengerId, defenderId });
        }
    }

    return due;
}
