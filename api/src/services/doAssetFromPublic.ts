import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const blobServiceClient = new BlobServiceClient(
    `https://${storageAccount}.blob.core.windows.net`,
    new DefaultAzureCredential()
);

// Removes <publicName> from the public blob container; a missing blob is not an error.
export async function doAssetFromPublic(publicName: string): Promise<void> {

    await blobServiceClient
        .getContainerClient("public")
        .getBlockBlobClient(publicName)
        .deleteIfExists();
}
