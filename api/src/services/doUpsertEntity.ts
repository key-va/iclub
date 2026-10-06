import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";

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

export async function doUpsertEntity(
    pk: string,
    rk: string,
    properties: Record<string, unknown> = {}
): Promise<void> {

    await tableClient.upsertEntity(
        {
            partitionKey: pk,
            rowKey: rk,
            ...properties
        },
        "Replace"
    );
}