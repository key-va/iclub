import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import { BlobServiceClient } from "@azure/storage-blob";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const credential = new DefaultAzureCredential();

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "guids",
    credential
);

const blobServiceClient = new BlobServiceClient(
    `https://${storageAccount}.blob.core.windows.net`,
    credential
);

export async function doGuidsToPublic(): Promise<number> {

    const rows = [];

    for await (const entity of tableClient.listEntities()) {

        const {
            partitionKey,
            rowKey,
            timestamp,
            etag,
            ...properties
        } = entity;

        rows.push({
            pk: partitionKey,
            rk: rowKey,
            ...properties,
            ...(timestamp ? { ts: timestamp } : {}),
            ...(etag ? { et: etag } : {})
        });
    }

    const blobClient = blobServiceClient
        .getContainerClient("public")
        .getBlockBlobClient("guids.json");

    await blobClient.uploadData(
        Buffer.from(
            JSON.stringify(rows, null, 2),
            "utf8"
        ),
        {
            blobHTTPHeaders: {
                blobContentType: "application/json"
            }
        }
    );

    return rows.length;
}