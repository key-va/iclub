import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";

import { doBotVerification } from "../services/doSignatureVerification";
import { doGuidsToPublic } from "../services/doGuidsToPublic";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const credential = new DefaultAzureCredential();

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    credential
);

export async function systemRestore(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {

    let body: { caller_id?: string; signature?: string; data?: unknown };
    try { body = await request.json() as typeof body; }
    catch { return { status: 400, jsonBody: { success: false, message: "Invalid JSON payload" } }; }
    try { doBotVerification({ callerId: body?.caller_id, signature: body?.signature }); }
    catch (error) { return { status: 401, jsonBody: { success: false, message: error instanceof Error ? error.message : "Unauthorised" } }; }

    try {
        const rows = body.data;

        if (!Array.isArray(rows)) {
            return {
                status: 400,
                jsonBody: {
                    success: false,
                    message: "data must contain a JSON array."
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
                        message: "Every row must contain pk and rk."
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
                message: `Okay, restored ${restored} rows (${deleted} removed, ${exported} exported)`,
                data: { deleted, restored, exported }
            }
        };

    } catch (error) {

        context.error("Restore failed.", error);

        return {
            status: 500,
            jsonBody: {
                success: false,
                message: error instanceof Error
                    ? error.message
                    : "Restore failed."
            }
        };
    }
}

app.http("systemRestore", {
    methods: ["POST"],
    route: "system/restore",
    authLevel: "anonymous",
    handler: systemRestore
});