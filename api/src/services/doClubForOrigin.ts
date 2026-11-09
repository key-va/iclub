import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storage = resourceName(resourceSuffix.storageAccount);
const client = new TableClient(`https://${storage}.table.core.windows.net`, "guids", new DefaultAzureCredential());

// Branding is selected by the visiting origin, not by membership or ladder relations.
export async function doClubForOrigin(origin: string) {
    let url: URL;
    try { url = new URL(origin); } catch { return null; }
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.origin !== origin) return null;
    for await (const row of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${"club"} and url eq ${url.hostname}` } })) {
        if (row.url !== url.hostname) continue;
        const colour = (value: unknown, fallback: string) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
        return {
            name: String(row.name || "Intra Club"),
            foreground: colour(row.foreground, "#FF1493"),
            background: colour(row.background, "#00BFFF"),
            icon: `https://${storage}.blob.core.windows.net/public/${row.rowKey}.jpg`,
            icon180: `https://${storage}.blob.core.windows.net/public/${row.rowKey}_180.png`,
            icon192: `https://${storage}.blob.core.windows.net/public/${row.rowKey}_192.png`,
            icon512: `https://${storage}.blob.core.windows.net/public/${row.rowKey}_512.png`
        };
    }
    return null;
}
