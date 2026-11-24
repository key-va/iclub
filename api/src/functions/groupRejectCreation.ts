import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectCreation } from "../services/creationRejection";

export async function groupRejectCreation(request: HttpRequest, context: InvocationContext) {
    return rejectCreation(request, context, "group");
}

app.http("groupRejectCreation", {
    methods: ["POST"],
    route: "group/{group_id}/reject-creation",
    authLevel: "anonymous",
    handler: groupRejectCreation,
});
