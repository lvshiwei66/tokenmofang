// ============================================================
// Domain types for tmf CLI
// ============================================================

// --- Provider metadata from API ---

export interface ProviderDetail {
  name: string;
  displayName?: string;
  defaultModel?: string;
  baseUrl?: string;
}

// --- Settings (stored in ~/.tokenmofang/settings.json) ---

export interface ProviderSettings {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface Settings {
  providers?: Record<string, ProviderSettings>;
  clientId?: string;
}

// --- Test command types ---

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
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  throughput: number | null;
}

// --- Test error codes ---

export type TestErrorCode =
  | "NO_BASE_URL"
  | "NO_API_KEY"
  | "UNREACHABLE"
  | "AUTH_FAILED"
  | "SERVER_ERROR"
  | "NO_USAGE"
  | "NETWORK_ERROR"
  | "EMPTY_PROMPT";

export class TestError extends Error {
  constructor(
    message: string,
    public readonly code: TestErrorCode,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "TestError";
  }
}
