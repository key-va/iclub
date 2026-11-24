import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectCreation } from "../services/creationRejection";

export async function ladderRejectCreation(request: HttpRequest, context: InvocationContext) {
    return rejectCreation(request, context, "ladder");
}

app.http("ladderRejectCreation", {
    methods: ["POST"],
    route: "ladder/{ladder_id}/reject-creation",
    authLevel: "anonymous",
    handler: ladderRejectCreation,
});
