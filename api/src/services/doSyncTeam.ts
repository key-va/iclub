import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { resourceName, resourceSuffix } from "../stores/resourceNames";
import { doNewGuid } from "./doNewGuid";
import { doUpsertEntity } from "./doUpsertEntity";
import { doUpsertRelation } from "./doUpsertRelation";
import { doGuidsToPublic } from "./doGuidsToPublic";
import { CompetitionSnapshot, TeamMapping } from "./competitionProvider";
import { providerFor } from "./trols";

const client = new TableClient(
    `https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential(),
);
export const approvedTeamRole = (role: unknown) =>
    role === "is_admin" || role === "is_member";
export function teamMapping(team: Record<string, unknown>): TeamMapping {
    const keys = [
        "provider",
        "association",
        "competition",
        "section",
        "external_team",
        "season",
    ];
    if (keys.some((key) => typeof team[key] !== "string" || !team[key]))
        throw Error("Team external mapping is incomplete");
    return Object.fromEntries(
        keys.map((key) => [key, team[key]]),
    ) as unknown as TeamMapping;
}
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
    // Read ownership from entity attributes too, so an interrupted team-round mirror
    // write can be repaired without creating another internal round ID.
    for await (const round of client.listEntities({
        queryOptions: {
            filter: odata`PartitionKey eq ${"round"} and team_id eq ${teamId}`,
        },
    })) {
        if (round.team_id !== teamId) continue;
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
            round.opponent !== old.opponent &&
            old.status === "completed"
        )
            throw Error("A completed round has a conflicting fixture");
    }
    let created = 0,
        updated = 0;
    for (const round of source.rounds) {
        const external_key = externalRoundKey(mapping, round.number);
        const old = existing.get(external_key);
        const id = old?.rowKey ?? doNewGuid("round");
        const { partitionKey, rowKey, timestamp, etag, ...attributes } =
            old ?? {};
        // An omitted result is not evidence that a previously published result was withdrawn.
        const official = { ...round };
        if (
            old &&
            round.status === "scheduled" &&
            ["completed", "washout", "postponed"].includes(old.status)
        )
            official.status = old.status;
        const next = {
            ...attributes,
            ...official,
            provider: mapping.provider,
            external_key,
            team_id: teamId,
            name: `Round ${round.number} — ${round.opponent}`,
        };
        if (!old || Object.entries(next).some(([k, v]) => old[k] !== v)) {
            await doUpsertEntity("round", id, next);
            if (old) updated++;
            else created++;
        }
        await doUpsertRelation(teamId, id);
    }
    await doEnsureRoundUsers(teamId);
    const { partitionKey, rowKey, timestamp, etag, ...attributes } = team;
    const standing = source.standings.find((s) => s.name === team.name);
    await doUpsertEntity("team", teamId, {
        ...attributes,
        standings: JSON.stringify(source.standings),
        calendar: JSON.stringify(source.calendar),
        ...(standing
            ? {
                  rank: standing.rank,
                  wins: standing.wins,
                  points: standing.points,
                  percentage: standing.percentage,
              }
            : {}),
        last_synced: new Date().toISOString(),
    });
    await doGuidsToPublic();
    return { created, updated, rounds: source.rounds.length };
}
