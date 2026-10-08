import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function about(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const name = request.query.get('name') || await request.text() || 'world';

    return {
        status: 200,
        jsonBody: {
            name: "Intra Club API",
            status: "online",
            version: "1.0.0",
            timestamp: new Date().toISOString()
        }
    };
};

app.http('about', {
    methods: ['GET', 'POST'],
    route: "system/about",
    authLevel: 'anonymous',
    handler: about
});
