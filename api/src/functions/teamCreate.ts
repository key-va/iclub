import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { odata } from "@azure/data-tables";
import { client, get, push, relations, reply, runTeamOperation, teamRequest } from "../services/teamActions";
import { doNewGuid } from "../services/doNewGuid";
import { doUpsertEntity } from "../services/doUpsertEntity";
import { doUpsertRelation } from "../services/doUpsertRelation";
import { doGuidsToPublic } from "../services/doGuidsToPublic";
import { doAssetToPublic } from "../services/doAssetToPublic";
import { doClubForOrigin } from "../services/doClubForOrigin";
import { providerFor } from "../services/trols";
import { teamMapping } from "../services/doSyncTeam";
import { teamExternalFields, externalTeamKey } from "../services/competitionData";
import { teamContext } from "../services/teamRelations";

export async function teamCreate(request: HttpRequest, context: InvocationContext) {
    const input = await teamRequest(request, context);
    if ("status" in input) return input;
    const { caller_id, data } = input;
    return runTeamOperation(context, async () => {
        const requester = caller_id.startsWith("user_")
            ? await get("user", caller_id)
            : undefined;
        if (!requester) return reply(403, "A user account is required");
        if (
            ["association", "competition", "section", "team"].some(
                (k) => typeof data[k] !== "string" || !data[k],
            )
        )
            return reply(400, "Complete all competition selections");
        const brand = await doClubForOrigin(
            request.headers.get("origin") ?? "",
        );
        if (!brand)
            return reply(400, "Open your club website to request a team");
        let mapping;
        try {
            mapping = await providerFor("trols").resolve(data);
        } catch (error) {
            context.warn("TROLS selection validation failed", error);
            return reply(
                400,
                "The selected competition or team is no longer available",
            );
        }
        let image: Buffer | undefined;
        if (data.image !== undefined) {
            if (typeof data.image !== "string")
                return reply(400, "Invalid team image");
            image = Buffer.from(
                data.image.replace(/^data:image\/jpe?g;base64,/i, ""),
                "base64",
            );
            if (
                image.length > 1024 * 1024 ||
                image[0] !== 255 ||
                image[1] !== 216 ||
                image[2] !== 255
            )
                return reply(400, "Image must be a JPEG of 1MB or less");
        }
        // A short club-entity lease protects duplicate checks across independent API instances.
        const club = await client.getEntity("club", brand.clubId);
        if (Number(club.team_request_until) > Date.now())
            return reply(
                409,
                "Another team request is being saved; please retry",
            );
        try {
            await client.updateEntity(
                {
                    partitionKey: "club",
                    rowKey: brand.clubId,
                    team_request_until: Date.now() + 60000,
                },
                "Merge",
                { etag: club.etag },
            );
        } catch (e: any) {
            if (e.statusCode === 412)
                return reply(
                    409,
                    "Another team request is being saved; please retry",
                );
            throw e;
        }
        try {
            // Include incomplete earlier creations too: a failed relation write must not
            // allow another entity for the same external team on a retry.
            for await (const old of client.listEntities({
                queryOptions: {
                    filter: odata`PartitionKey eq ${"team"}`,
                },
            })) {
                if (
                    old.state !== "rejected" &&
                    (await teamContext(old.rowKey)).clubId ===
                        brand.clubId &&
                    [
                        "provider",
                        "association",
                        "season",
                        "section",
                        "external_team",
                    ].every((k) => teamMapping(old)[k] === mapping[k])
                ) {
                    return reply(
                        409,
                        "This team has already been requested for your club",
                        { team_id: old.rowKey },
                        old.rowKey,
                    );
                }
            }
            const id = doNewGuid("team");
            try {
                await doAssetToPublic(
                    image ?? { publicName: `${brand.clubId}.jpg` },
                    `${id}.jpg`,
                );
            } catch (e: any) {
                if (!image && e.statusCode === 404)
                    await doAssetToPublic("icon-00.jpg", `${id}.jpg`);
                else throw e;
            }
            await doUpsertRelation(id, brand.clubId);
            await doUpsertRelation(id, caller_id, {
                is_admin: true,
                is_member: true,
            });
            await doUpsertEntity("team", id, {
                ...teamExternalFields(mapping),
                name: mapping.name,
                state: "pending",
                external_key: externalTeamKey(mapping),
                operation_guard: 0,
            });
            await doGuidsToPublic();
            await push(
                (await relations(brand.clubId))
                    .filter(
                        (r) =>
                            r.rowKey.startsWith("user_") &&
                            r.is_admin === true,
                    )
                    .map((r) => r.rowKey),
                mapping.name,
                `${requester.name || "A player"} has requested to create this team`,
                `team/${id}`,
                context,
            );
            return reply(
                201,
                "Team requested; waiting for club approval",
                undefined,
                id,
            );
        } finally {
            await client.updateEntity(
                {
                    partitionKey: "club",
                    rowKey: brand.clubId,
                    team_request_until: 0,
                },
                "Merge",
            );
        }
    });
}

app.http("teamcreate", {
    methods: ["POST"],
    route: "team/create",
    authLevel: "anonymous",
    handler: teamCreate,
});
