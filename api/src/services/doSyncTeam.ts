import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { resourceName, resourceSuffix } from "../stores/resourceNames";
import { doNewGuid } from "./doNewGuid";
import { doUpsertEntity } from "./doUpsertEntity";
import { doUpsertRelation } from "./doUpsertRelation";
import { doGuidsToPublic } from "./doGuidsToPublic";
import { CompetitionSnapshot, TeamMapping } from "./competitionProvider";
import { providerFor } from "./trols";
import {
    teamMapping,
    teamAttributes,
    roundAttributes,
    roundCondition,
} from "./competitionData";
export { teamMapping } from "./competitionData";

const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);
export const approvedTeamRole = (role: unknown) =>
    role === "is_admin" || role === "is_member";
export const externalRoundKey = (mapping: TeamMapping, number: number) =>
    JSON.stringify([
        mapping.provider,
        mapping.association,
        mapping.season,
        mapping.section,
        mapping.external_team,
        number,
    ]);

// Repair missing links as well as populating new members/rounds. Existing roles are never replaced.
export async function doEnsureRoundUsers(teamId: string) {
    const relations = [];
    for await (const row of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${teamId}` },
    }))
        relations.push(row);
    const members = relations.filter(
        (r) => r.rowKey.startsWith("user_") && approvedTeamRole(r.role),
    );
    for (const round of relations.filter((r) => r.rowKey.startsWith("round_")))
        for (const user of members) {
            let existing;
            try {
                existing = await client.getEntity(round.rowKey, user.rowKey);
            } catch (error: any) {
                if (error.statusCode !== 404) throw error;
            }
            // The forward role is authoritative if a prior sequential mirror write was interrupted.
            let inverse;
            try {
                inverse = await client.getEntity(user.rowKey, round.rowKey);
            } catch (error: any) {
                if (error.statusCode !== 404) throw error;
            }
            if (!existing || !inverse || inverse.role !== existing.role)
                await doUpsertRelation(round.rowKey, user.rowKey, {
                    role: existing?.role ?? inverse?.role ?? "pending",
                });
        }
}

// Fetch/parse before any writes; callers may prefetch for activation. No notifications or scheduling here.
export async function doSyncTeam(
    teamId: string,
    snapshot?: CompetitionSnapshot,
) {
    const team = await client.getEntity("team", teamId);
    if (team.state !== "active")
        throw Error("Only an active team can be synchronised");
    const mapping = teamMapping(team);
    const source =
        snapshot ?? (await providerFor(mapping.provider).snapshot(mapping));
    const existing = new Map<string, Record<string, any>>();
    // Ownership lives in the mirrored graph. Read either direction so an interrupted
    // mirror write can be repaired without changing a round's identity.
    const roundIds = new Set<string>();
    for await (const relation of client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${teamId}` },
    })) {
        if (relation.rowKey.startsWith("round_")) roundIds.add(relation.rowKey);
    }
    for await (const relation of client.listEntities({
        queryOptions: { filter: odata`RowKey eq ${teamId}` },
    })) {
        if (
            relation.rowKey === teamId &&
            relation.partitionKey.startsWith("round_")
        )
            roundIds.add(relation.partitionKey);
    }
    // Migration only: recover legacy rounds whose old team_id was saved before their
    // first relation write. Never let that deprecated attribute override graph ownership.
    for await (const legacy of client.listEntities({
        queryOptions: {
            filter: odata`PartitionKey eq ${"round"} and team_id eq ${teamId}`,
        },
    })) {
        if (legacy.team_id !== teamId || roundIds.has(legacy.rowKey)) continue;
        let otherOwner = false;
        for await (const relation of client.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${legacy.rowKey}` },
        })) {
            if (
                relation.rowKey.startsWith("team_") &&
                relation.rowKey !== teamId
            )
                otherOwner = true;
        }
        if (!otherOwner) roundIds.add(legacy.rowKey);
    }
    for (const id of roundIds) {
        const round = await client.getEntity("round", id);
        for await (const relation of client.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${id}` },
        })) {
            if (
                relation.rowKey.startsWith("team_") &&
                relation.rowKey !== teamId
            )
                throw Error("A round cannot belong to multiple teams");
        }
        if (
            typeof round.external_key !== "string" ||
            existing.has(round.external_key)
        )
            throw Error("Invalid or duplicate team round identity");
        existing.set(round.external_key, round);
    }
    // Validate the complete plan before the first write, including conflicts with saved rounds.
    if (
        !source.rounds.length ||
        new Set(source.rounds.map((r) => r.number)).size !==
            source.rounds.length
    )
        throw Error("Invalid competition round identities");
    for (const round of source.rounds) {
        if (
            !Number.isInteger(round.number) ||
            round.number < 1 ||
            !/^\d{4}-\d{2}-\d{2}$/.test(round.date) ||
            !round.opponent ||
            !["scheduled", "completed", "bye", "washout", "postponed"].includes(
                round.status,
            )
        )
            throw Error("Invalid competition round");
        const old = existing.get(externalRoundKey(mapping, round.number));
        if (
            old &&
            round.opponent !== (old.ext_opponent ?? old.opponent) &&
            roundCondition(old) === "completed"
        )
            throw Error("A completed round has a conflicting fixture");
    }
    let created = 0,
        updated = 0;
    for (const round of source.rounds) {
        const external_key = externalRoundKey(mapping, round.number);
        const old = existing.get(external_key);
        const id = old?.rowKey ?? doNewGuid("round");
        const next = roundAttributes(
            old ?? {},
            mapping.provider,
            external_key,
            round,
        );
        const previousAttributes = old
            ? Object.fromEntries(
                  Object.entries(old).filter(
                      ([key]) =>
                          ![
                              "partitionKey",
                              "rowKey",
                              "timestamp",
                              "etag",
                          ].includes(key),
                  ),
              )
            : {};
        if (
            !old ||
            Object.keys(previousAttributes).length !==
                Object.keys(next).length ||
            Object.entries(next).some(
                ([key, value]) => previousAttributes[key] !== value,
            )
        ) {
            await doUpsertEntity("round", id, next);
            if (old) updated++;
            else created++;
        }
        await doUpsertRelation(teamId, id);
    }
    // Retain rounds omitted from a later source response, but migrate their old
    // ownership attribute/name too. Their last known official fields stay intact.
    const importedKeys = new Set(
        source.rounds.map((round) => externalRoundKey(mapping, round.number)),
    );
    for (const [key, old] of existing) {
        if (importedKeys.has(key)) continue;
        const rowKey = old.rowKey;
        const next = roundAttributes(old, mapping.provider, key);
        const previousAttributes = Object.fromEntries(
            Object.entries(old).filter(
                ([key]) =>
                    !["partitionKey", "rowKey", "timestamp", "etag"].includes(
                        key,
                    ),
            ),
        );
        if (
            Object.keys(previousAttributes).length !==
                Object.keys(next).length ||
            Object.entries(next).some(
                ([key, value]) => previousAttributes[key] !== value,
            )
        ) {
            await doUpsertEntity("round", rowKey, next);
            updated++;
        }
        await doUpsertRelation(teamId, rowKey);
    }
    await doEnsureRoundUsers(teamId);
    const attributes = teamAttributes(team);
    const standing = source.standings.find((s) => s.name === team.name);
    await doUpsertEntity("team", teamId, {
        ...attributes,
        ext_standings: JSON.stringify(source.standings),
        ext_calendar: JSON.stringify(source.calendar),
        ...(standing
            ? {
                  ext_rank: standing.rank,
                  ext_wins: standing.wins,
                  ext_points: standing.points,
                  ext_percentage: standing.percentage,
              }
            : {}),
        last_synced: new Date().toISOString(),
    });
    await doGuidsToPublic();
    return { created, updated, rounds: source.rounds.length };
}
