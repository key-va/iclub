import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { membershipAction } from "./membership";

export async function groupLeave(request: HttpRequest, context: InvocationContext) {
    return membershipAction(request, context, "group", "leave");
}

app.http("groupLeave", {
    methods: ["POST"],
    route: "group/{group_id}/leave",
    authLevel: "anonymous",
    handler: groupLeave,
});
