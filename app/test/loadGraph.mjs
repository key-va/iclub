// Load fixtures through the public store API, just as the app loads guids.json.
export async function loadGraph(guids, items) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(items));
    try { await guids.load('https://example.test/guids.json'); }
    finally { globalThis.fetch = originalFetch; }
}
