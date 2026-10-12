import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

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
            message: `Okay, Intra Club is up and running with ${total} total entities`,
            data: [counts]
        }
    };
}

app.http('systemAbout', {
    methods: ['GET', 'POST'],
    route: "system/about",
    authLevel: 'anonymous',
    handler: systemAbout
});
