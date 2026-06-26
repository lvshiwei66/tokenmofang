import type { TestParams, TestResult } from "../types/provider.js";
import { TestError } from "../types/provider.js";

/**
 * Parse an SSE stream body and collect chunks.
 * Returns parsed JSON objects from each `data:` line.
 */
async function collectSSEChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: ReadableStreamDefaultController<{ chunk: unknown; ts: number }>,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last partial line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const payload = trimmed.slice(6); // after "data: "
      if (payload === "[DONE]") continue;

      try {
        const chunk = JSON.parse(payload);
        controller.enqueue({ chunk, ts: Date.now() });
      } catch {
        // Skip unparseable chunks
      }
    }
  }

  // Process remaining buffer
  const remaining = buffer.trim();
  if (remaining.startsWith("data: ") && remaining.slice(6) !== "[DONE]") {
    try {
      const chunk = JSON.parse(remaining.slice(6));
      controller.enqueue({ chunk, ts: Date.now() });
    } catch {
      // Skip
    }
  }
}

/**
 * Build a ReadableStream of SSE chunks with timestamps,
 * then extract metrics from the collected chunks.
 */
async function collectStream(
  body: ReadableStream<Uint8Array> | null,
): Promise<{ chunks: Array<{ chunk: unknown; ts: number }> }> {
  if (!body) {
    throw new TestError("请检查网络连接", "NETWORK_ERROR");
  }

  const chunks: Array<{ chunk: unknown; ts: number }> = [];

  return new Promise((resolve, reject) => {
    const stream = new ReadableStream<{ chunk: unknown; ts: number }>({
      start(controller) {
        collectSSEChunks(body.getReader(), controller)
          .then(() => controller.close())
          .catch(reject);
      },
    });

    const reader = stream.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    };

    pump()
      .then(() => resolve({ chunks }))
      .catch(reject);
  });
}

/**
 * Test a Provider by making a real streaming Chat Completion request.
 *
 * Pure function — no console.log, no process.exit.
 * Throws TestError on non-timeout failures.
 * Returns `{ accessible: false, ... }` on timeout (Unreachable).
 */
export async function testProvider(params: TestParams): Promise<TestResult> {
  const { baseUrl, apiKey, model, prompt, timeoutMs } = params;

  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    stream_options: { include_usage: true },
  });

  const startTime = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof DOMException &&
        (err.name === "TimeoutError" || err.name === "AbortError")) ||
      (err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError"));
    if (isTimeout) {
      return {
        accessible: false,
        latencyMs: null,
        tokenUsage: null,
        throughput: null,
      };
    }
    throw new TestError("请检查网络连接", "NETWORK_ERROR");
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new TestError(
        `认证失败（状态码: 401），请检查 API Key 是否正确`,
        "AUTH_FAILED",
        401,
      );
    }
    if (response.status >= 500) {
      throw new TestError(
        `服务异常（状态码: ${response.status}），请稍后重试`,
        "SERVER_ERROR",
        response.status,
      );
    }
    throw new TestError(
      `请求失败（状态码: ${response.status}）`,
      "NETWORK_ERROR",
      response.status,
    );
  }

  // Collect SSE chunks
  const { chunks } = await collectStream(response.body);

  if (chunks.length === 0) {
    return {
      accessible: false,
      latencyMs: null,
      tokenUsage: null,
      throughput: null,
    };
  }

  // TTFT from first chunk
  const firstChunk = chunks[0];
  const ttft = firstChunk.ts - startTime;

  // Find the last chunk with usage
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null =
    null;
  let lastTs = startTime;

  for (const { chunk, ts } of chunks) {
    lastTs = ts;
    const c = chunk as Record<string, unknown>;
    if (c.usage && typeof c.usage === "object") {
      const u = c.usage as Record<string, unknown>;
      if (
        typeof u.prompt_tokens === "number" &&
        typeof u.completion_tokens === "number" &&
        typeof u.total_tokens === "number"
      ) {
        usage = {
          prompt_tokens: u.prompt_tokens,
          completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens,
        };
      }
    }
  }

  if (!usage) {
    throw new TestError("响应数据异常，无法提取 Token 消耗", "NO_USAGE");
  }

  const totalTime = lastTs - startTime;
  const generationTime = totalTime - ttft;

  const throughput =
    generationTime > 0 ? usage.completion_tokens / (generationTime / 1000) : null;

  return {
    accessible: true,
    latencyMs: ttft,
    tokenUsage: {
      prompt: usage.prompt_tokens,
      completion: usage.completion_tokens,
      total: usage.total_tokens,
    },
    throughput: throughput !== null ? Math.round(throughput * 10) / 10 : null,
  };
}
