import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { activateEntityRequest } from "../services/clubEntityRequests";

export async function groupActivate(request: HttpRequest, context: InvocationContext) {
    return activateEntityRequest(request, context, "group");
}

app.http("groupActivate", {
    methods: ["POST"],
    route: "group/{group_id}/activate",
    authLevel: "anonymous",
    handler: groupActivate,
});
