import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectCreation } from "../services/creationRejection";

export async function compRejectCreation(request: HttpRequest, context: InvocationContext) {
    return rejectCreation(request, context, "comp");
}

app.http("compRejectCreation", {
    methods: ["POST"],
    route: "comp/{comp_id}/reject-creation",
    authLevel: "anonymous",
    handler: compRejectCreation,
});
