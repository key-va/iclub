import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectCreation } from "../services/creationRejection";

export async function teamRejectCreation(request: HttpRequest, context: InvocationContext) {
    return rejectCreation(request, context, "team");
}

app.http("teamRejectCreation", {
    methods: ["POST"],
    route: "team/{team_id}/reject-creation",
    authLevel: "anonymous",
    handler: teamRejectCreation,
});
