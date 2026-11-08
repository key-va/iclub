import { InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient, odata } from "@azure/data-tables";
import webpush from "web-push";
import { doWebPushConfig, isPushEndpoint } from "./doWebPushConfig";
import { resourceName, resourceSuffix } from "../stores/resourceNames";

const client = new TableClient(`https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`, "auths", new DefaultAzureCredential());

export interface PushMessage {
    userIds: string[];
    exceptUserId?: string;
    heading: string;
    content: string;
    path: string;
    collapseId?: string;
}

// Best effort, as before. A notification failure must never fail the user's action.
export async function doSendPush(message: PushMessage, context?: InvocationContext): Promise<boolean> {
    try {
        const vapidDetails = doWebPushConfig();
        if (!vapidDetails) { context?.warn("WEB_PUSH_VAPID_KEYS is not configured; push not sent."); return false; }
        const seen = new Set<string>();
        let accepted = false;
        for (const userId of new Set(message.userIds.filter(id => id !== message.exceptUserId))) {
            for await (const row of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${userId}` } })) {
                const endpoint = row.push_endpoint as string;
                if (!row.rowKey?.startsWith("device_") || !isPushEndpoint(endpoint) || seen.has(endpoint)) continue;
                seen.add(endpoint);
                try {
                    const origin = new URL(String(row.origin)).origin;
                    // Always open the app origin where this device subscribed.
                    const url = new URL(`/${message.path.replace(/^\/+/, "")}`, origin);
                    if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue;
                    await webpush.sendNotification({ endpoint, keys: { p256dh: String(row.push_p256dh), auth: String(row.push_auth) } }, JSON.stringify({
                        title: message.heading, body: message.content, url: url.href,
                        icon: new URL("/favicons/favicon-192.png", origin).href,
                        badge: new URL("/favicons/favicon-android.png", origin).href,
                        tag: message.collapseId
                    }), { vapidDetails, TTL: 86400, timeout: 10000 });
                    accepted = true;
                } catch (err: any) {
                    if (err?.statusCode === 404 || err?.statusCode === 410) {
                        // Conditional merge protects a subscription refreshed during sending.
                        try { await client.updateEntity({ partitionKey: row.partitionKey, rowKey: row.rowKey, push_endpoint: "", push_p256dh: "", push_auth: "" }, "Merge", { etag: row.etag }); }
                        catch { context?.warn("Could not clear expired push subscription."); }
                    } else context?.warn(`Web Push failed (${err?.statusCode ?? "network/configuration"}).`);
                }
            }
        }
        return accepted;
    } catch { context?.warn("Web Push dispatch failed."); return false; }
}
