import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { membershipAction } from "./membership";

export async function teamLeave(request: HttpRequest, context: InvocationContext) {
    return membershipAction(request, context, "team", "leave");
}

app.http("teamLeave", {
    methods: ["POST"],
    route: "team/{team_id}/leave",
    authLevel: "anonymous",
    handler: teamLeave,
});
