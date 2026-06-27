// ============================================================
// Domain types for tmf CLI
// ============================================================

// --- Provider metadata from API ---

export interface ProviderDetail {
  name: string;
  displayName?: string;
  defaultModel?: string;
  /** Per ADR-0004: multi-protocol URL map. `default` is required. */
  urls?: Record<string, string>;
}

// --- Settings (stored in ~/.tokenmofang/settings.json) ---

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

// --- Test command types ---

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
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  throughput: number | null;
}

// --- Test error codes ---

export type TestErrorCode =
  | "NO_BASE_URL"
  | "NO_API_KEY"
  | "UNREACHABLE"
  | "AUTH_FAILED"
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NO_USAGE"
  | "NETWORK_ERROR"
  | "EMPTY_PROMPT";

/** Structured exit codes for scripting (per AGENTS.md §Error Handling). */
export const TEST_EXIT_CODES: Record<TestErrorCode, number> = {
  NO_BASE_URL: 2,
  NO_API_KEY: 3,
  UNREACHABLE: 4,
  AUTH_FAILED: 5,
  BAD_REQUEST: 6,
  FORBIDDEN: 7,
  NOT_FOUND: 8,
  RATE_LIMITED: 9,
  SERVER_ERROR: 10,
  NO_USAGE: 11,
  NETWORK_ERROR: 12,
  EMPTY_PROMPT: 13,
};

export class TestError extends Error {
  constructor(
    message: string,
    public readonly code: TestErrorCode,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "TestError";
  }

  /** Exit code per AGENTS.md structured error codes for scripting. */
  get exitCode(): number {
    return TEST_EXIT_CODES[this.code];
  }
}
