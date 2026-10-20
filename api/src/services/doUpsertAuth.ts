import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const credential = new DefaultAzureCredential();

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "auths",
    credential
);

export async function doUpsertAuth(
    pk: string,
    rk: string,
    properties: Record<string, unknown> = {}
): Promise<void> {

    await tableClient.upsertEntity(
        {
            partitionKey: pk,
            rowKey: rk,
            ...properties,
            ...(typeof properties.email === "string" ? { email: properties.email.trim().toLowerCase() } : {})
        },
        "Replace"
    );
}
