import { InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import crypto from "crypto";

const storageAccount = process.env.ICLUB_STORAGE_ACCOUNT;

if (!storageAccount) {
    throw new Error("ICLUB_STORAGE_ACCOUNT is not configured.");
}

const credential = new DefaultAzureCredential();

const tableClient = new TableClient(
    `https://${storageAccount}.table.core.windows.net`,
    "auths",
    credential
);

export interface SignatureVerificationInput {
    callerId: string;
    deviceId: string;
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

    // Temporary bot path
    if (input.callerId.startsWith("bot_")) {

        const botSecret = process.env.SYSTEM_BOT_SECRET;

        if (!botSecret) {
            throw new Error("SYSTEM_BOT_SECRET not configured");
        }

        if (!input.signature || input.signature !== botSecret) {
            throw new Error("Invalid bot secret");
        }

        return;
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
