import type { TableClient } from "@azure/data-tables";

export async function notificationName(client: TableClient, id?: string): Promise<string> {
    if (!id) return "A player";
    const type = id.startsWith("pair_") ? "pair" : id.startsWith("bot_") ? "bot" : "user";
    try {
        const { name } = await client.getEntity<{ name?: string }>(type, id);
        if (name?.trim()) return name.trim();
    } catch {
        // A missing name should not prevent the notification or fail a completed mutation.
    }
    return type === "pair" ? "The pair" : "A player";
}
