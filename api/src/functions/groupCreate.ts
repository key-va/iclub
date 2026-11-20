import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { createEntityRequest } from "../services/clubEntityRequests";

export async function groupCreate(request: HttpRequest, context: InvocationContext) {
    return createEntityRequest(request, context, "group");
}

app.http("groupCreate", {
    methods: ["POST"],
    route: "group/create",
    authLevel: "anonymous",
    handler: groupCreate,
});
