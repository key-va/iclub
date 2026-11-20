import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { withCompResult, score } from "../services/compActions";

export async function compCorrect(request: HttpRequest, context: InvocationContext) {
    return withCompResult(request, context, async ({ elim, data, caller, admin }) => {
        return score(elim, String(data.match_id ?? ""), caller, admin, "correct", data, context);
    });
}

app.http("compCorrect", {
    methods: ["POST"],
    route: "comp/{comp_id}/correct",
    authLevel: "anonymous",
    handler: compCorrect,
});
