import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { reply, teamRequest } from "../services/teamActions";
import { providerFor } from "../services/trols";

export async function teamOptions(request: HttpRequest, context: InvocationContext) {
    const input = await teamRequest(request, context, false);
    if ("status" in input) return input;
    const { data } = input;
    if (
        ["association", "competition", "section"].some(
            (k) => data[k] !== undefined && typeof data[k] !== "string",
        )
    )
        return reply(400, "Invalid selection");
    try {
        return reply(
            200,
            "Competition options",
            await providerFor("trols").options(data),
        );
    } catch (error) {
        context.warn("TROLS options failed", error);
        return reply(
            502,
            "Competition options could not be loaded. Please retry.",
        );
    }
}

app.http("teamoptions", {
    methods: ["POST"],
    route: "team/options",
    authLevel: "anonymous",
    handler: teamOptions,
});
