import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    new DefaultAzureCredential()
);

async function count(pk: string): Promise<number> {

    let total = 0;

    const entities = tableClient.listEntities({
        queryOptions: {
            filter: odata`PartitionKey eq ${pk}`,
            select: ["RowKey"]
        }
    });

    for await (const _ of entities) {
        total++;
    }

    return total;
}

export async function systemAbout(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const [users, clubs, ladders, matches] = await Promise.all([
        count("user"),
        count("club"),
        count("ladder"),
        count("match")
    ]);

    return {
        status: 200,
        jsonBody: {
            message: `Okay, Intra Club is up and running`,
            data: [
                { users, clubs, ladders, matches }
            ]
        }
    };
}

app.http('systemAbout', {
    methods: ['GET', 'POST'],
    route: "system/about",
    authLevel: 'anonymous',
    handler: systemAbout
});
