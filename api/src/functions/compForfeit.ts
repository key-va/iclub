import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withCompResult, score } from "../services/compActions";

export async function compForfeit(request: HttpRequest, context: InvocationContext) {
    return withCompResult(request, context, async ({ elim, data, caller, admin }) => {
        return score(elim, String(data.match_id ?? ""), caller, admin, "forfeit", data, context);
    });
}

app.http("compForfeit", {
    methods: ["POST"],
    route: "comp/{comp_id}/forfeit",
    authLevel: "anonymous",
    handler: compForfeit,
});
