import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Command } from "commander";
import { registerTestCommand } from "../src/commands/test.js";
import { writeSettings } from "../src/config/settings.js";
import { TEST_EXIT_CODES } from "../src/types/provider.js";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

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

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function run(args: string[]): Promise<CommandResult> {
  const result: CommandResult = { stdout: "", stderr: "", exitCode: 0 };

  // Spy on console to capture output from the action handler
  vi.spyOn(console, "log").mockImplementation((...msgs: unknown[]) => {
    result.stdout += msgs.map((m) => String(m)).join(" ") + "\n";
  });
  vi.spyOn(console, "error").mockImplementation((...msgs: unknown[]) => {
    result.stderr += msgs.map((m) => String(m)).join(" ") + "\n";
  });
  // Spy on process.exit to capture exit code
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    result.exitCode = code ?? 0;
    throw new Error(`process.exit(${code})`);
  }) as never);

  const program = new Command();
  program
    .name("tmf")
    .version("0.1.0")
    .exitOverride((err) => {
      const e = err as { code: string; exitCode: number; message: string };
      // Only set exit code if not already set by process.exit spy
      if (result.exitCode === 0 && e.exitCode !== undefined) {
        result.exitCode = e.exitCode;
      }
      throw err;
    })
    .configureOutput({
      writeOut: (str: string) => {
        result.stdout += str;
      },
      writeErr: (str: string) => {
        result.stderr += str;
      },
    });

  registerTestCommand(program);

  try {
    await program.parseAsync(args, { from: "user" });
  } catch {
    // Exit code already captured via spy or exitOverride
  }

  return result;
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("test command integration", () => {
  beforeEach(() => {
    writeSettings({
      providers: {
        packcode: {
          apiKey: "sk-saved-key",
          model: "deepseek-v4-pro",
          urls: { default: "https://api.deepseek.com/openai", openai: "https://api.deepseek.com/openai" },
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows help text", async () => {
    const { stdout, exitCode } = await run(["test", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--model");
    expect(stdout).toContain("--key");
    expect(stdout).toContain("--verbose");
  });

  it("errors when provider has no saved settings and no flags", async () => {
    writeSettings({ providers: {} });

    const { stderr, exitCode } = await run(["test", "unknown-provider"]);

    expect(exitCode).toBe(TEST_EXIT_CODES.NO_API_KEY);
    expect(stderr).toContain("API Key");
  });

  it("uses --key flag for apiKey", async () => {
    writeSettings({
      providers: {
        packcode: {
          model: "deepseek-v4-pro",
          urls: { default: "https://api.deepseek.com/openai", openai: "https://api.deepseek.com/openai" },
        },
      },
    });

    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const { stdout, exitCode } = await run(["test", "packcode", "--key", "sk-from-flag"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("正在测试 packcode");

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-from-flag");
  });

  it("uses --model flag to override saved model", async () => {
    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const { exitCode } = await run(["test", "packcode", "--model", "custom-model"]);

    expect(exitCode).toBe(0);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const reqBody = JSON.parse(calls[0][1].body as string);
    expect(reqBody.model).toBe("custom-model");
  });

  it("outputs Unreachable on timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("aborted"), { name: "TimeoutError" }),
      ),
    );

    const { stdout, exitCode } = await run(["test", "packcode"]);

    expect(exitCode).toBe(TEST_EXIT_CODES.UNREACHABLE);
    expect(stdout).toContain("延迟 N/A，无法访问");
  });

  it("shows auth error on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const { stderr, exitCode } = await run(["test", "packcode"]);

    expect(exitCode).toBe(TEST_EXIT_CODES.AUTH_FAILED);
    expect(stderr).toContain("认证失败");
    expect(stderr).toContain("401");
  });

  it("shows server error on 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const { stderr, exitCode } = await run(["test", "packcode"]);

    expect(exitCode).toBe(TEST_EXIT_CODES.SERVER_ERROR);
    expect(stderr).toContain("服务异常");
    expect(stderr).toContain("503");
  });

  it("shows verbose output with --verbose", async () => {
    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hello" }, index: 0 }] }),
      JSON.stringify({
        choices: [{ delta: { content: " world" }, index: 0 }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const { stdout, exitCode } = await run(["test", "packcode", "--verbose"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("首 token 到达");
    expect(stdout).toContain("Token 消耗");
  });

  it("uses --prompt flag for custom prompt", async () => {
    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const { stdout, exitCode } = await run([
      "test",
      "packcode",
      "--prompt",
      "Say hello",
      "--verbose",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Say hello");
  });

  it("falls back to saved apiKey from settings.json", async () => {
    const body = makeSSEBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const { exitCode } = await run(["test", "packcode"]);

    expect(exitCode).toBe(0);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-saved-key");
  });
});
