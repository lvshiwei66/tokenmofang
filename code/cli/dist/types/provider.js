// ============================================================
// Domain types for tmf CLI
// ============================================================
/** Structured exit codes for scripting (per AGENTS.md §Error Handling). */
export const TEST_EXIT_CODES = {
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
    code;
    statusCode;
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = "TestError";
    }
    /** Exit code per AGENTS.md structured error codes for scripting. */
    get exitCode() {
        return TEST_EXIT_CODES[this.code];
    }
}
//# sourceMappingURL=provider.js.map