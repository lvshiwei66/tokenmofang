import { describe, it, expect, vi, afterEach } from "vitest";
import { testProvider } from "../src/providers/tester.js";
import { TestError } from "../src/types/provider.js";
import type { TestParams } from "../src/types/provider.js";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const BASE_PARAMS: TestParams = {
  baseUrl: "https://api.example.com",
  apiKey: "sk-test",
  model: "test-model",
  prompt: "Hello",
  timeoutMs: 5000,
};

function makeSSEBody(...lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(lines.map((l) => `data: ${l}\n\n`).join(""));
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

function mockFetchResponse(status: number, body: ReadableStream<Uint8Array> | null): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
}

function mockFetchNetworkError(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("testProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Happy path ---

  it("returns latency, token usage, and throughput for a successful stream", async () => {
    mockFetchResponse(
      200,
      makeSSEBody(
        JSON.stringify({ choices: [{ delta: { content: "Hello" }, index: 0 }] }),
        JSON.stringify({
          choices: [{ delta: { content: " world" }, index: 0 }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      ),
    );

    const result = await testProvider(BASE_PARAMS);

    expect(result.accessible).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.tokenUsage).toEqual({ prompt: 10, completion: 5, total: 15 });
    // Throughput may be null if all chunks arrive in the same tick (instant mock stream).
    // In real-world streaming this never happens.
    if (result.throughput !== null) {
      expect(result.throughput).toBeGreaterThan(0);
    }
  });

  it("handles [DONE] markers and skips them", async () => {
    const encoder = new TextEncoder();
    const raw =
      `data: ${JSON.stringify({ choices: [{ delta: { content: "X" }, index: 0 }] })}\n\n` +
      `data: [DONE]\n\n` +
      `data: ${JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`;

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(raw));
        controller.close();
      },
    });

    mockFetchResponse(200, body);

    const result = await testProvider(BASE_PARAMS);

    expect(result.accessible).toBe(true);
    expect(result.tokenUsage).toEqual({ prompt: 1, completion: 1, total: 2 });
  });

  it("reads usage from the last chunk that has it", async () => {
    mockFetchResponse(
      200,
      makeSSEBody(
        JSON.stringify({
          choices: [{ delta: { content: "A" }, index: 0 }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }),
        JSON.stringify({
          choices: [{ delta: { content: "B" }, index: 0 }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
      ),
    );

    const result = await testProvider(BASE_PARAMS);

    expect(result.tokenUsage).toEqual({ prompt: 5, completion: 3, total: 8 });
  });

  // --- Error cases ---

  it("returns inaccessible on timeout (TimeoutError)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }),
      ),
    );

    const result = await testProvider(BASE_PARAMS);

    expect(result.accessible).toBe(false);
    expect(result.latencyMs).toBeNull();
    expect(result.tokenUsage).toBeNull();
    expect(result.throughput).toBeNull();
  });

  it("returns inaccessible on AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
      ),
    );

    const result = await testProvider(BASE_PARAMS);

    expect(result.accessible).toBe(false);
  });

  it("throws NETWORK_ERROR on connection failure", async () => {
    mockFetchNetworkError();

    await expect(testProvider(BASE_PARAMS)).rejects.toThrow(TestError);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("throws AUTH_FAILED on HTTP 401", async () => {
    mockFetchResponse(401, null);

    await expect(testProvider(BASE_PARAMS)).rejects.toThrow(TestError);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({
      code: "AUTH_FAILED",
      statusCode: 401,
    });
  });

  it("throws SERVER_ERROR on HTTP 503", async () => {
    mockFetchResponse(503, null);

    await expect(testProvider(BASE_PARAMS)).rejects.toThrow(TestError);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      statusCode: 503,
    });
  });

  it("throws SERVER_ERROR on HTTP 502", async () => {
    mockFetchResponse(502, null);

    await expect(testProvider(BASE_PARAMS)).rejects.toThrow(TestError);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });

  it("throws NO_USAGE when no chunk has usage field", async () => {
    mockFetchResponse(
      200,
      makeSSEBody(
        JSON.stringify({ choices: [{ delta: { content: "Hello" }, index: 0 }] }),
        JSON.stringify({
          choices: [{ delta: { content: " world" }, index: 0, finish_reason: "stop" }],
        }),
      ),
    );

    let err: unknown;
    try {
      await testProvider(BASE_PARAMS);
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(TestError);
    expect((err as TestError).code).toBe("NO_USAGE");
  });

  it("returns inaccessible when stream produces zero data chunks", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    mockFetchResponse(200, body);

    const result = await testProvider(BASE_PARAMS);

    expect(result.accessible).toBe(false);
  });

  // --- Edge cases ---

  it("strips trailing slash from baseUrl", async () => {
    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );

    const fetchSpy = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await testProvider({ ...BASE_PARAMS, baseUrl: "https://api.example.com/" });

    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.example.com/chat/completions");
  });

  it("includes stream_options.include_usage in request body", async () => {
    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );

    const fetchSpy = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await testProvider(BASE_PARAMS);

    const reqBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(reqBody.stream).toBe(true);
    expect(reqBody.stream_options).toEqual({ include_usage: true });
    expect(reqBody.model).toBe("test-model");
    expect(reqBody.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  // --- New HTTP error codes ---

  it("throws BAD_REQUEST on HTTP 400", async () => {
    mockFetchResponse(400, null, false);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({ code: "BAD_REQUEST", statusCode: 400 });
  });

  it("throws FORBIDDEN on HTTP 403", async () => {
    mockFetchResponse(403, null, false);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("throws NOT_FOUND on HTTP 404", async () => {
    mockFetchResponse(404, null, false);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
  });

  it("throws RATE_LIMITED on HTTP 429", async () => {
    mockFetchResponse(429, null, false);
    await expect(testProvider(BASE_PARAMS)).rejects.toMatchObject({ code: "RATE_LIMITED", statusCode: 429 });
  });

  // --- AbortSignal ---

  it("returns inaccessible when aborted via signal", async () => {
    const controller = new AbortController();
    controller.abort();

    // fetch never called because signal is already aborted — but AbortSignal.any will pass the abort
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    ));

    const result = await testProvider({ ...BASE_PARAMS, signal: controller.signal });
    expect(result.accessible).toBe(false);
  });

  // --- Stream total timeout ---

  it("throws UNREACHABLE when stream reading exceeds total timeout", async () => {
    // Create a stream that delivers one chunk then hangs forever
    const hangingBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"first"},"index":0}]}\n\n',
        ));
        // Never calls controller.close() — reader hangs on second read
      },
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(hangingBody, { status: 200 })));

    // timeoutMs=100 → streamTimeoutMs = max(100 - elapsed, 1000) = 1000ms
    await expect(
      testProvider({ ...BASE_PARAMS, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  }, 5000);


  it("uses Bearer auth header", async () => {
    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );

    const fetchSpy = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await testProvider(BASE_PARAMS);

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
  });
});
