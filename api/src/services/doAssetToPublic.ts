import { readFile } from "fs/promises";
import { basename, extname, join, resolve } from "path";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

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
// `source` is either the name of a file in src/assets or the file content itself (e.g. a user upload).
export async function doAssetToPublic(source: string | Buffer, publicName: string): Promise<void> {

    // Keep asset lookups inside the assets folder
    const data = typeof source === "string"
        ? await readFile(join(assetsDir, basename(source)))
        : source;

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
