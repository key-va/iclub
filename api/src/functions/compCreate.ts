import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { createEntityRequest } from "../services/clubEntityRequests";

export async function compCreate(request: HttpRequest, context: InvocationContext) {
    return createEntityRequest(request, context, "comp");
}

app.http("compCreate", {
    methods: ["POST"],
    route: "comp/create",
    authLevel: "anonymous",
    handler: compCreate,
});
