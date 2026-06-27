import type { ProviderDetail } from "../types/provider.js";
/**
 * Fetches provider detail from the Token魔方 API.
 * Returns null when the API is unreachable or the provider is not found.
 */
export declare function fetchProviderInfo(name: string): Promise<ProviderDetail | null>;
