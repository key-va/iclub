import { doNewGuid } from "./doNewGuid";
import { doUpsertEntity } from "./doUpsertEntity";
import { doUpsertRelation } from "./doUpsertRelation";

// The bootstrap "Intra Club Bot" entity (shared/sample-data.json); it posts automated messages
export const botId = "bot_0000-00-00_00-00-00_bootstrap00b";

// Records a message on a match: a `message` entity (name = text) related to the match and to its sender (role "sender"),
// which is the bot for automated messages. Does not publish or notify; the caller does both.
export async function doPostMessage(input: { matchId: string; text: string; senderId: string }): Promise<string> {

    const messageId = doNewGuid("message");

    await doUpsertEntity("message", messageId, { name: input.text });
    await doUpsertRelation(messageId, input.senderId, { role: "sender" });
    await doUpsertRelation(messageId, input.matchId);

    return messageId;
}
