import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { rejectJoin } from "../services/joinRejection";
import { saveMembership, withOpenComp } from "../services/compActions";

export async function compReject(request: HttpRequest, context: InvocationContext) {
    return withOpenComp(request, context, true, async ({ id, elim, data, members }) => {
        const applicant = members.find(row => row.rowKey === data.user_id);
        return rejectJoin(id, elim, data.user_id, applicant, context,
            (userId, values) => saveMembership(id, new Map([[userId, values]])));
    });
}

app.http("compReject", {
    methods: ["POST"],
    route: "comp/{comp_id}/reject",
    authLevel: "anonymous",
    handler: compReject,
});
