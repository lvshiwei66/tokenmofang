/**
 * Fetches provider detail from the Token魔方 API.
 * Returns null when the API is unreachable or the provider is not found.
 */
export async function fetchProviderInfo(name) {
    // TODO: Replace with real API endpoint when the API is deployed.
    // The API endpoint will be discovered via the client registration flow.
    try {
        const apiBase = process.env.TMF_API_BASE ?? "https://api.tokenmofang.com";
        const res = await fetch(`${apiBase}/api/v1/providers/${encodeURIComponent(name)}`, {
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            if (res.status === 404)
                return null;
            return null;
        }
        return (await res.json());
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=api.js.map