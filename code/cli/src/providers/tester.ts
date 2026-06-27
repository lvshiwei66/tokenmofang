import type { TestParams, TestResult } from "../types/provider.js";
import { TestError } from "../types/provider.js";

// ---------------------------------------------------------------
// SSE stream parsing
// ---------------------------------------------------------------

interface TimedChunk {
  chunk: unknown;
  ts: number;
}

/**
 * Parse an SSE stream body into timed chunks.
 * Reads the response body line-by-line, extracting `data:` payloads.
 * Handles [DONE] sentinel, cross-packet fragmentation, BOM, \\r\\n, and heartbeat lines.
 */
async function collectSSEChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (c: TimedChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) break;

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      // Strip \\r and trim
      const trimmed = line.replace(/\r$/, "").trim();
      if (!trimmed.startsWith("data:")) continue;

      // Extract payload after "data:" (with optional space)
      let payload = trimmed.slice(5);
      if (payload.startsWith(" ")) payload = payload.slice(1);

      // Skip [DONE] sentinel
      if (payload === "[DONE]") continue;
      if (payload.length === 0) continue;

      try {
        const chunk = JSON.parse(payload);
        onChunk({ chunk, ts: Date.now() });
      } catch {
        // Skip unparseable lines (heartbeats, comments)
      }
    }
  }

  // Process remaining buffer
  const remaining = buffer.replace(/\r$/, "").trim();
  if (remaining.startsWith("data:")) {
    let payload = remaining.slice(5);
    if (payload.startsWith(" ")) payload = payload.slice(1);
    if (payload !== "[DONE]" && payload.length > 0) {
      try {
        const chunk = JSON.parse(payload);
        onChunk({ chunk, ts: Date.now() });
      } catch {
        // Skip
      }
    }
  }
}

/**
 * Collect all timed chunks from a ReadableStream body,
 * with an optional total timeout and abort signal.
 */
async function collectStream(
  body: ReadableStream<Uint8Array> | null,
  streamTimeoutMs: number,
  signal?: AbortSignal,
): Promise<TimedChunk[]> {
  if (!body) {
    throw new TestError("请检查网络连接", "NETWORK_ERROR");
  }

  const chunks: TimedChunk[] = [];
  const { promise, resolve, reject } = Promise.withResolvers<TimedChunk[]>();

  // Total stream timeout — races against the reader loop
  const timeoutId = setTimeout(() => {
    reject(new TestError("延迟 N/A，无法访问", "UNREACHABLE"));
  }, streamTimeoutMs);

  const reader = body.getReader();

  collectSSEChunks(
    reader,
    (c) => chunks.push(c),
    signal,
  )
    .then(() => {
      clearTimeout(timeoutId);
      resolve(chunks);
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

  // Wire abort signal
  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        reader.cancel().catch(() => {});
        reject(new TestError("延迟 N/A，无法访问", "UNREACHABLE"));
      },
      { once: true },
    );
  }

  return promise;
}

// ---------------------------------------------------------------
// Main test function
// ---------------------------------------------------------------

/**
 * Test a Provider by making a real streaming Chat Completion request.
 *
 * Pure function — no console.log, no process.exit.
 * Throws TestError on non-timeout failures.
 * Returns `{ accessible: false, ... }` on timeout (Unreachable).
 */
export async function testProvider(params: TestParams): Promise<TestResult> {
  const { baseUrl, apiKey, model, prompt, timeoutMs, signal } = params;

  // Per ADR-0004: the resolved baseUrl is used as-is (no additional path appended)
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    stream_options: { include_usage: true },
  });

  const startTime = Date.now();

  // --- HTTP request (with first-token timeout via AbortSignal.timeout) ---
  let response: Response;
  try {
    // Merge caller signal with internal timeout
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: requestSignal,
    });
  } catch (err: unknown) {
    if (
      (err instanceof DOMException &&
        (err.name === "TimeoutError" || err.name === "AbortError")) ||
      (err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError"))
    ) {
      return {
        accessible: false,
        latencyMs: null,
        tokenUsage: null,
        throughput: null,
      };
    }
    throw new TestError("请检查网络连接", "NETWORK_ERROR");
  }

  // --- HTTP status handling ---
  if (!response.ok) {
    if (response.status === 401) {
      throw new TestError(
        "认证失败（状态码: 401），请检查 API Key 是否正确",
        "AUTH_FAILED",
        401,
      );
    }
    if (response.status === 403) {
      throw new TestError(
        "权限不足（状态码: 403），请检查 API Key 权限",
        "FORBIDDEN",
        403,
      );
    }
    if (response.status === 404) {
      throw new TestError(
        "端点不存在（状态码: 404），请检查 API 地址或模型名称",
        "NOT_FOUND",
        404,
      );
    }
    if (response.status === 429) {
      throw new TestError(
        "请求过于频繁（状态码: 429），请稍后重试",
        "RATE_LIMITED",
        429,
      );
    }
    if (response.status >= 500) {
      throw new TestError(
        `服务异常（状态码: ${response.status}），请稍后重试`,
        "SERVER_ERROR",
        response.status,
      );
    }
    // 400 and other 4xx
    if (response.status === 400) {
      throw new TestError(
        `请求无效（状态码: 400），请检查模型名称 "${model}" 是否正确`,
        "BAD_REQUEST",
        400,
      );
    }
    throw new TestError(
      `请求失败（状态码: ${response.status}）`,
      "NETWORK_ERROR",
      response.status,
    );
  }

  // --- Collect SSE chunks (with total stream timeout) ---
  // Total stream timeout = remaining time from the original timeoutMs
  const elapsed = Date.now() - startTime;
  const streamTimeoutMs = Math.max(timeoutMs - elapsed, 1000);

  const chunks = await collectStream(response.body, streamTimeoutMs, signal);

  if (chunks.length === 0) {
    return {
      accessible: false,
      latencyMs: null,
      tokenUsage: null,
      throughput: null,
    };
  }

  // --- TTFT from first chunk ---
  const firstChunk = chunks[0];
  const ttft = firstChunk.ts - startTime;

  // --- Find the last chunk with usage ---
  let usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null = null;
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

  // --- Compute throughput ---
  const totalTime = lastTs - startTime;
  const generationTimeMs = totalTime - ttft;

  // throughput = completion_tokens / (generationTime in seconds)
  const throughput =
    generationTimeMs > 0
      ? Math.round((usage.completion_tokens / (generationTimeMs / 1000)) * 10) / 10
      : null;

  return {
    accessible: true,
    latencyMs: ttft,
    tokenUsage: {
      prompt: usage.prompt_tokens,
      completion: usage.completion_tokens,
      total: usage.total_tokens,
    },
    throughput,
  };
}
