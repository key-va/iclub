import { InvocationContext } from "@azure/functions";

const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
const publicUrl = process.env.ONESIGNAL_APP_URL;
const pushIcon = "https://"+process.env.RESOURCE_GROUP_PREFIX+".blob.core.windows.net/public/favicon-android.png";

export interface PushMessage {
    userIds: string[];
    heading: string;
    content: string;
    path: string;
    collapseId?: string;
}

// Sends a OneSignal push to the given users (external ids). Never throws: a failed push must not fail the caller.
export async function doSendPush(message: PushMessage, context?: InvocationContext): Promise<boolean> {
    const apiKey = process.env.ONESIGNAL_API_KEY;

    if (!apiKey) {
        context?.warn("ONESIGNAL_API_KEY is not configured; push not sent.");
        return false;
    }

    try {
        const response = await fetch("https://api.onesignal.com/notifications?c=push", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Key ${apiKey}`
            },
            body: JSON.stringify({
                app_id: oneSignalAppId,
                target_channel: "push",
                include_aliases: { external_id: message.userIds },
                headings: { en: message.heading },
                contents: { en: message.content },
                chrome_web_badge: pushIcon,
                chrome_web_icon: pushIcon,
                url: `${publicUrl}/${message.path.replace(/^\//, "")}`,
                ...(message.collapseId ? { collapse_id: message.collapseId } : {})
            })
        });

        if (!response.ok) {
            context?.warn(`OneSignal push failed (${response.status}): ${await response.text()}`);
            return false;
        }

        return true;
    } catch (err) {
        context?.warn(`OneSignal push error: ${err instanceof Error ? err.message : err}`);
        return false;
    }
}
