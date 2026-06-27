export interface ProviderDetail {
    name: string;
    displayName?: string;
    defaultModel?: string;
    /** Per ADR-0004: multi-protocol URL map. `default` is required. */
    urls?: Record<string, string>;
}
export interface ProviderSettings {
    apiKey?: string;
    model?: string;
    /** Per ADR-0004: stored as full urls map from API. */
    urls?: Record<string, string>;
}
export interface Settings {
    providers?: Record<string, ProviderSettings>;
    clientId?: string;
}
export interface TestParams {
    /** Resolved single URL for the chat/completions endpoint */
    baseUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
    /** Timeout in ms for first token (default: 30000) */
    timeoutMs: number;
    /** Optional signal for caller abort (Ctrl+C) */
    signal?: AbortSignal;
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
export type TestErrorCode = "NO_BASE_URL" | "NO_API_KEY" | "UNREACHABLE" | "AUTH_FAILED" | "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "SERVER_ERROR" | "NO_USAGE" | "NETWORK_ERROR" | "EMPTY_PROMPT";
/** Structured exit codes for scripting (per AGENTS.md §Error Handling). */
export declare const TEST_EXIT_CODES: Record<TestErrorCode, number>;
export declare class TestError extends Error {
    readonly code: TestErrorCode;
    readonly statusCode?: number | undefined;
    constructor(message: string, code: TestErrorCode, statusCode?: number | undefined);
    /** Exit code per AGENTS.md structured error codes for scripting. */
    get exitCode(): number;
}
