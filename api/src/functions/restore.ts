import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";

import { doGuidsToPublic } from "../services/doGuidsToPublic";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const credential = new DefaultAzureCredential();

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    credential
);

export async function restore(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {

    try {

        const rows = await request.json();

        if (!Array.isArray(rows)) {
            return {
                status: 400,
                jsonBody: {
                    success: false,
                    error: "POST body must contain a JSON array."
                }
            };
        }

        // Check every row has a pk and rk before changing the table.
        for (const row of rows) {
            if (
                !row ||
                typeof row !== "object" ||
                typeof row.pk !== "string" ||
                typeof row.rk !== "string"
            ) {
                return {
                    status: 400,
                    jsonBody: {
                        success: false,
                        error: "Every row must contain pk and rk."
                    }
                };
            }
        }

        // Clear the existing guids table.
        let deleted = 0;

        for await (const entity of tableClient.listEntities()) {
            await tableClient.deleteEntity(
                entity.partitionKey,
                entity.rowKey
            );

            deleted++;
        }

        // Restore the supplied rows.
        let restored = 0;

        for (const row of rows) {

            const {
                pk,
                rk,
                ts,
                et,
                ...properties
            } = row;

            await tableClient.createEntity({
                partitionKey: pk,
                rowKey: rk,
                ...properties
            });

            restored++;
        }

        // Publish the resulting table.
        const exported = await doGuidsToPublic();

        return {
            status: 200,
            jsonBody: {
                success: true,
                deleted,
                restored,
                exported
            }
        };

    } catch (error) {

        context.error("Restore failed.", error);

        return {
            status: 500,
            jsonBody: {
                success: false,
                error: error instanceof Error
                    ? error.message
                    : "Restore failed."
            }
        };
    }
}

app.http("restore", {
    methods: ["POST"],
    route: "system/restore",
    authLevel: "anonymous",
    handler: restore
});