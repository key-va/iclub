import { readFile } from "fs/promises";
import { basename, extname, join, resolve } from "path";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const blobServiceClient = new BlobServiceClient(
    `https://${storageAccount}.blob.core.windows.net`,
    new DefaultAzureCredential()
);

// Compiled output lives in dist/src/services, the assets stay in <api>/src/assets
const assetsDir = resolve(__dirname, "..", "..", "..", "src", "assets");

const contentTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
};

// Writes to the public blob container as <publicName>, replacing any existing blob.
// `source` is a local asset name, uploaded bytes, or an existing public blob to copy.
export async function doAssetToPublic(source: string | Buffer | { publicName: string }, publicName: string): Promise<void> {

    // Keep asset lookups inside the assets folder
    const data = typeof source === "string"
        ? await readFile(join(assetsDir, basename(source)))
        : Buffer.isBuffer(source)
            ? source
            : await blobServiceClient.getContainerClient("public")
                .getBlockBlobClient(basename(source.publicName)).downloadToBuffer();

    await blobServiceClient
        .getContainerClient("public")
        .getBlockBlobClient(publicName)
        .uploadData(data, {
            blobHTTPHeaders: {
                blobContentType: contentTypes[extname(publicName).toLowerCase()] ?? "application/octet-stream",
                blobCacheControl: "no-cache"
            }
        });
}
