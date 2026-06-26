// ============================================================
// Domain types for tmf CLI
// ============================================================
export class TestError extends Error {
    code;
    statusCode;
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = "TestError";
    }
}
//# sourceMappingURL=provider.js.map