import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { activateEntityRequest } from "../services/clubEntityRequests";

export async function compActivate(request: HttpRequest, context: InvocationContext) {
    return activateEntityRequest(request, context, "comp");
}

app.http("compActivate", {
    methods: ["POST"],
    route: "comp/{comp_id}/activate",
    authLevel: "anonymous",
    handler: compActivate,
});
