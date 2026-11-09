import { InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import crypto from "crypto";

import { resourceName, resourceSuffix } from "../stores/resourceNames";

const storageAccount = resourceName(resourceSuffix.storageAccount);

const credential = new DefaultAzureCredential();

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "auths",
    credential
);

export interface SignatureVerificationInput {
    callerId: string;
    deviceId?: string;
    url: string;
    signature: string;
}

// Host, scheme, and query can differ, so only the URL pathname is signed.
export function toPath(url: string): string {

    const parsed = new URL(url, "http://localhost");

    return parsed.pathname;
}

// Clients must sign exactly this string (UTF-8).
export function buildSignedMessage(
    input: Pick<SignatureVerificationInput, "callerId" | "deviceId" | "url">
): string {

    return JSON.stringify([
        input.callerId,
        input.deviceId,
        toPath(input.url)
    ]);
}

export async function doSignatureVerification(
    input: SignatureVerificationInput,
    context?: InvocationContext
): Promise<void> {

    if (typeof input.callerId !== "string" || typeof input.signature !== "string" || !input.signature) {
        throw new Error("Caller and signature are required");
    }
    if (input.callerId.startsWith("bot_")) {
        doBotVerification({ callerId: input.callerId, signature: input.signature });
        return;
    }
    if (typeof input.deviceId !== "string" || !input.deviceId) {
        throw new Error("Device ID is required for user callers");
    }

    let publicKeyBase64: string | undefined;

    try {
        const entity = await tableClient.getEntity<{ key?: string }>(
            input.callerId,
            input.deviceId
        );

        publicKeyBase64 = entity.key;

    } catch (err: any) {

        if (err?.statusCode === 404) {
            throw new Error("Device not registered for caller");
        }

        throw err;
    }

    if (!publicKeyBase64 || publicKeyBase64.trim().length === 0) {
        throw new Error("Public key missing for device");
    }

    // Stored key is Base64 SPKI
    const publicKeyPem =
        "-----BEGIN PUBLIC KEY-----\n" +
        publicKeyBase64.match(/.{1,64}/g)?.join("\n") +
        "\n-----END PUBLIC KEY-----";

    const verifier = crypto.createVerify("SHA256");

    verifier.update(buildSignedMessage(input));
    verifier.end();

    const isValid = verifier.verify(
        {
            key: publicKeyPem,
            dsaEncoding: "ieee-p1363"
        },
        Buffer.from(input.signature, "base64")
    );

    context?.log("signature valid:", isValid, "caller:", input.callerId);

    if (!isValid) {
        throw new Error("Invalid signature");
    }
}


// Shared-key authentication for bot-only provisioning endpoints and bot callers.
// No device registration or ECDSA operation is involved in this path.
export function doBotVerification(input: { callerId?: unknown; signature?: unknown }): void {
    if (typeof input.callerId !== "string" || !/^bot_[A-Za-z0-9_-]+$/.test(input.callerId) ||
        typeof input.signature !== "string" || !input.signature) {
        throw new Error("Valid bot caller_id and signature key are required");
    }
    const key = process.env.INTRA_CLUB_BOT_KEY;
    if (!key || /^@Microsoft\.KeyVault\(/i.test(key)) throw new Error("Bot key is not configured");
    const digest = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest();
    if (!crypto.timingSafeEqual(digest(input.signature), digest(key))) throw new Error("Invalid bot key");
}
