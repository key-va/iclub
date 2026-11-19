import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { membershipAction } from "./membership";
export const ladderAway = (request: HttpRequest, context: InvocationContext) => membershipAction(request, context, "ladder", "away");
app.http("ladderAway", { methods: ["POST"], route: "ladder/{ladder_id}/away", authLevel: "anonymous", handler: ladderAway });
