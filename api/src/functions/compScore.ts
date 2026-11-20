import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withCompResult, score } from "../services/compActions";

export async function compScore(request: HttpRequest, context: InvocationContext) {
    return withCompResult(request, context, async ({ elim, data, caller, admin }) => {
        return score(elim, String(data.match_id ?? ""), caller, admin, "score", data, context);
    });
}

app.http("compScore", {
    methods: ["POST"],
    route: "comp/{comp_id}/score",
    authLevel: "anonymous",
    handler: compScore,
});
