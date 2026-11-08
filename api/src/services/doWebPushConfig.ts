import { createECDH } from "crypto";

// A single Key Vault JSON secret, supplied through a Function App setting.
export function doWebPushConfig(): { publicKey: string; privateKey: string; subject: string } | undefined {
    try {
        const keys = JSON.parse(process.env.WEB_PUSH_VAPID_KEYS ?? "null");
        if (!keys || !/^[\w-]{87}$/.test(keys.publicKey) || !/^[\w-]{43}$/.test(keys.privateKey)) return;
        const subject = process.env.WEB_PUSH_SUBJECT || "https://app.intra.club";
        if (!/^(mailto:|https:\/\/)/.test(subject)) return;
        const ecdh = createECDH("prime256v1");
        ecdh.setPrivateKey(Buffer.from(keys.privateKey, "base64url"));
        if (ecdh.getPublicKey().toString("base64url") !== keys.publicKey) return;
        return { ...keys, subject };
    } catch { return; }
}

// Only browser push providers may be contacted using client-supplied endpoints.
export function isPushEndpoint(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 4096) return false;
    try {
        const url = new URL(value);
        const host = url.hostname;
        return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
            (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
             host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com" ||
             host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com"));
    } catch { return false; }
}
