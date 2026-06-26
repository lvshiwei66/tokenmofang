import type { TestParams, TestResult } from "../types/provider.js";
/**
 * Test a Provider by making a real streaming Chat Completion request.
 *
 * Pure function — no console.log, no process.exit.
 * Throws TestError on non-timeout failures.
 * Returns `{ accessible: false, ... }` on timeout (Unreachable).
 */
export declare function testProvider(params: TestParams): Promise<TestResult>;
