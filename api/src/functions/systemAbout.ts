import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

const oneSignalAppId = process.env.ONESIGNAL_APP_ID;

export async function systemAbout(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    // Entity rows have a bare type as pk (e.g. "user"); relation rows use entity ids (containing "_") as pk.
    const counts: Record<string, number> = {};
    let total = 0;

    for await (const row of tableClient.listEntities({ queryOptions: { select: ["PartitionKey"] } })) {
        const pk = row.partitionKey;
        if (!pk || pk.includes("_")) continue;
        counts[pk] = (counts[pk] ?? 0) + 1;
        total++;
    }

    return {
        status: 200,
        jsonBody: {
            success: true,
            message: `Okay, Intra Club is up and running with ${total} total entities`,
            data: {
                ONESIGNAL_APP_ID: oneSignalAppId && !oneSignalAppId.startsWith('@Microsoft.KeyVault(') ? oneSignalAppId : null,
                counts
            }
        }
    };
}

app.http('systemAbout', {
    methods: ['GET', 'POST'],
    route: "system/about",
    authLevel: 'anonymous',
    handler: systemAbout
});
