export interface ProviderDetail {
    name: string;
    displayName?: string;
    defaultModel?: string;
    baseUrl?: string;
}
export interface ProviderSettings {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}
export interface Settings {
    providers?: Record<string, ProviderSettings>;
    clientId?: string;
}
export interface TestParams {
    baseUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
    /** Timeout in ms for first token (default: 30000) */
    timeoutMs: number;
}
export interface TestResult {
    accessible: boolean;
    latencyMs: number | null;
    tokenUsage: {
        prompt: number;
        completion: number;
        total: number;
    } | null;
    throughput: number | null;
}
export type TestErrorCode = "NO_BASE_URL" | "NO_API_KEY" | "UNREACHABLE" | "AUTH_FAILED" | "SERVER_ERROR" | "NO_USAGE" | "NETWORK_ERROR" | "EMPTY_PROMPT";
export declare class TestError extends Error {
    readonly code: TestErrorCode;
    readonly statusCode?: number | undefined;
    constructor(message: string, code: TestErrorCode, statusCode?: number | undefined);
}
