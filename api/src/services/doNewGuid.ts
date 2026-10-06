import { randomBytes } from "crypto";

export function doNewGuid(type: string): string {

    const now = new Date();

    const timestamp = now
        .toISOString()
        .replace("T", "_")
        .replace(/\.\d{3}Z$/, "")
        .replace(/:/g, "-");

    const random = randomBytes(6).toString("hex");

    return `${type}_${timestamp}_${random}`;
}