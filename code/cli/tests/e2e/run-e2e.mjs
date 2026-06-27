/**
 * E2E Test Suite for `tmf test` command (PR #41, Issue #8)
 *
 * 启动 mock SSE 服务器，通过真实 CLI 进程执行各场景，
 * 捕获 stdout/stderr/exitCode，输出结构化测试报告。
 *
 * Usage: node tests/e2e/run-e2e.mjs
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = join(__dirname, "../../");
const CLI_ENTRY = join(CLI_DIR, "dist/index.js");
const ARTIFACTS_DIR = join(__dirname, "artifacts");
const SETTINGS_DIR = join(process.env.HOME, ".tokenmofang");
const SETTINGS_PATH = join(SETTINGS_DIR, "settings.json");

// ── Artifacts setup ──────────────────────────────────────────
mkdirSync(ARTIFACTS_DIR, { recursive: true });

// ── SSE body builders ────────────────────────────────────────
function sseBody(...lines) {
  const encoder = new TextEncoder();
  const raw = lines.map((l) => `data: ${l}\n\n`).join("");
  return encoder.encode(raw);
}

// ── Mock server ──────────────────────────────────────────────
let mockPort = 0;
let mockServer = null;
let requestHandler = null; // dynamic override

function startMockServer() {
  return new Promise((resolve) => {
    mockServer = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requestHandler
          ? requestHandler(req, res, body)
          : defaultHandler(req, res, body);
      });
    });
    mockServer.listen(0, () => {
      mockPort = mockServer.address().port;
      resolve(mockPort);
    });
  });
}

function stopMockServer() {
  return new Promise((resolve) => {
    if (mockServer) mockServer.close(() => resolve());
    else resolve();
  });
}

function defaultHandler(req, res, _body) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const chunks = sseBody(
    JSON.stringify({ choices: [{ delta: { content: "Hello" }, index: 0 }] }),
    JSON.stringify({
      choices: [{ delta: { content: " world" }, index: 0 }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  );
  res.end(chunks);
}

// ── Settings helpers ─────────────────────────────────────────
function writeSettings(settings) {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

function saveSettings() {
  try {
    return readFileSync(SETTINGS_PATH, "utf-8");
  } catch {
    return null;
  }
}

function restoreSettings(saved) {
  if (saved) {
    writeFileSync(SETTINGS_PATH, saved, "utf-8");
  } else {
    try { unlinkSync(SETTINGS_PATH); } catch {}
  }
}

// ── CLI runner ───────────────────────────────────────────────
function runCLI(args, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const child = spawn("node", [CLI_ENTRY, ...args], {
      cwd: CLI_DIR,
      env: { ...process.env, TMF_API_BASE: `http://localhost:${mockPort}` },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: code ?? 1 });
    });

    child.on("error", (err) => {
      resolve({ stdout: stdout.trimEnd(), stderr: `${stderr}\n${err.message}`.trim(), exitCode: 1 });
    });
  });
}

// ── Test cases ───────────────────────────────────────────────
const tests = [];

function addTest(name, fn) {
  tests.push({ name, fn });
}

// T1: Happy path — successful stream
addTest("成功流式响应 (Happy path)", async () => {
  requestHandler = (req, res, _body) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunks = sseBody(
      JSON.stringify({ choices: [{ delta: { content: "Hello" }, index: 0 }] }),
      JSON.stringify({
        choices: [{ delta: { content: " world" }, index: 0 }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );
    res.end(chunks);
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 0 && stdout.includes("测试完成") && stdout.includes("Token 消耗"),
    exitCode,
    stdout,
    stderr,
  };
});

// T2: Auth error — 401
addTest("认证失败: 401", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(401);
    res.end();
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-bad-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 5 && stderr.includes("认证失败") && stderr.includes("401"),
    exitCode,
    stdout,
    stderr,
  };
});

// T3: Server error — 5xx
addTest("服务异常: 503", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(503);
    res.end();
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 10 && stderr.includes("服务异常") && stderr.includes("503"),
    exitCode,
    stdout,
    stderr,
  };
});

// T4: Forbidden — 403
addTest("权限不足: 403", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(403);
    res.end();
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 7 && stderr.includes("权限不足") && stderr.includes("403"),
    exitCode,
    stdout,
    stderr,
  };
});

// T5: Not found — 404
addTest("端点不存在: 404", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(404);
    res.end();
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 8 && stderr.includes("端点不存在") && stderr.includes("404"),
    exitCode,
    stdout,
    stderr,
  };
});

// T6: Rate limited — 429
addTest("请求频繁: 429", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(429);
    res.end();
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 9 && stderr.includes("请求过于频繁"),
    exitCode,
    stdout,
    stderr,
  };
});

// T7: Bad request — 400
addTest("请求无效: 400 (模型名错误)", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(400);
    res.end();
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 6 && stderr.includes("请求无效") && stderr.includes("400"),
    exitCode,
    stdout,
    stderr,
  };
});

// T8: Unreachable — timeout
addTest("超时/无法访问 (timeout)", async () => {
  requestHandler = (_req, res, _body) => {
    // Never respond — causes timeout
    // 5 seconds should trigger the 5s timeout in testProvider
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  // Use a short timeout (default is 30s though)
  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"], 35_000);
  return {
    pass: exitCode === 4 || stdout.includes("延迟 N/A，无法访问") || stdout.includes("无法访问"),
    exitCode,
    stdout,
    stderr,
  };
});

// T9: Verbose output
addTest("详细输出 (--verbose)", async () => {
  requestHandler = (req, res, _body) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunks = sseBody(
      JSON.stringify({ choices: [{ delta: { content: "Hi" }, index: 0 }] }),
      JSON.stringify({
        choices: [{ delta: { content: " there" }, index: 0 }],
        usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
      }),
    );
    res.end(chunks);
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock", "--verbose"]);
  return {
    pass:
      exitCode === 0 &&
      stdout.includes("首 token 到达") &&
      stdout.includes("Token 消耗") &&
      stdout.includes("速率"),
    exitCode,
    stdout,
    stderr,
  };
});

// T10: Custom prompt
addTest("自定义提示词 (--prompt)", async () => {
  const customPrompt = "Say hello in Chinese";

  requestHandler = (req, res, bodyStr) => {
    const body = JSON.parse(bodyStr);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunks = sseBody(
      JSON.stringify({ choices: [{ delta: { content: body.messages[0].content }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
    );
    res.end(chunks);
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI([
    "test",
    "mock",
    "--prompt",
    customPrompt,
    "--verbose",
  ]);
  return {
    pass: exitCode === 0 && stdout.includes(customPrompt),
    exitCode,
    stdout,
    stderr,
  };
});

// T11: --key flag takes priority
addTest("--key 参数优先于 settings.json", async () => {
  let receivedKey = null;

  requestHandler = (req, res, _body) => {
    receivedKey = req.headers.authorization;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunks = sseBody(
      JSON.stringify({ choices: [{ delta: { content: "OK" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );
    res.end(chunks);
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-from-settings",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock", "--key", "sk-from-flag"]);
  return {
    pass: exitCode === 0 && receivedKey === "Bearer sk-from-flag",
    exitCode,
    stdout,
    stderr,
  };
});

// T12: --model flag takes priority
addTest("--model 参数优先于 settings.json", async () => {
  let receivedModel = null;

  requestHandler = (req, res, bodyStr) => {
    const body = JSON.parse(bodyStr);
    receivedModel = body.model;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunks = sseBody(
      JSON.stringify({ choices: [{ delta: { content: "OK" }, index: 0 }] }),
      JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    );
    res.end(chunks);
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "saved-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock", "--model", "cli-model"]);
  return {
    pass: exitCode === 0 && receivedModel === "cli-model",
    exitCode,
    stdout,
    stderr,
  };
});

// T13: Missing API key
addTest("缺失 API Key 错误", async () => {
  requestHandler = null; // reset — HTTP never reached

  writeSettings({
    providers: {
      mock: {
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 3 && stderr.includes("API Key"),
    exitCode,
    stdout,
    stderr,
  };
});
// T14: Missing baseUrl
addTest("缺失 baseUrl 错误", async () => {
  // Mock needs to handle /api/v1/providers/mock GET (fetchProviderInfo fallback)
  // Default handler returns 200 SSE → res.json() fails → caught → null → NO_BASE_URL
  requestHandler = null;

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 2 && stderr.includes("API 地址"),
    exitCode,
    stdout,
    stderr,
  };
});

// T15: Empty prompt
addTest("空提示词错误 (--prompt '')", async () => {
  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock", "--prompt", ""]);
  return {
    pass: exitCode === 13 && stderr.includes("不能为空"),
    exitCode,
    stdout,
    stderr,
  };
});

// T16: No usage in response
addTest("响应无 usage 字段 (NO_USAGE 错误)", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunks = sseBody(
      JSON.stringify({ choices: [{ delta: { content: "Hello" }, index: 0 }] }),
      JSON.stringify({ choices: [{ delta: { content: " world" }, index: 0 }] }),
      // No usage field!
    );
    res.end(chunks);
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 11 && stderr.includes("无法提取 Token 消耗"),
    exitCode,
    stdout,
    stderr,
  };
});

// T17: Stream but no chunks (empty stream)
addTest("空流响应 (accessible=false)", async () => {
  requestHandler = (_req, res, _body) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    // Send [DONE] only — no data chunks
    const encoder = new TextEncoder();
    res.end(encoder.encode("data: [DONE]\n\n"));
  };

  writeSettings({
    providers: {
      mock: {
        apiKey: "sk-test-key",
        model: "mock-model",
        urls: { default: `http://localhost:${mockPort}`, openai: `http://localhost:${mockPort}` },
      },
    },
  });

  const { stdout, stderr, exitCode } = await runCLI(["test", "mock"]);
  return {
    pass: exitCode === 4 && stdout.includes("延迟 N/A，无法访问"),
    exitCode,
    stdout,
    stderr,
  };
});

// ── Run all tests ────────────────────────────────────────────
async function runAll() {
  const saved = saveSettings();

  try {
    console.log("Starting mock SSE server...");
    await startMockServer();
    console.log(`Mock server running on port ${mockPort}\n`);
    console.log("=".repeat(70));
    console.log("E2E Test Suite: tmf test command (PR #41)");
    console.log("=".repeat(70));

    let passed = 0;
    let failed = 0;
    const results = [];

    for (const { name, fn } of tests) {
      try {
        const result = await fn();
        results.push({ name, ...result });
        const status = result.pass ? "✅ PASS" : "❌ FAIL";
        console.log(`\n${status}: ${name}`);
        if (!result.pass) {
          console.log(`  exitCode: ${result.exitCode}`);
          console.log(`  stdout: ${result.stdout.substring(0, 200)}`);
          console.log(`  stderr: ${result.stderr.substring(0, 200)}`);
        }
        if (result.pass) passed++;
        else failed++;
      } catch (err) {
        console.log(`\n💥 ERROR: ${name}`);
        console.log(`  ${err.message}`);
        results.push({ name, pass: false, error: err.message });
        failed++;
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Pass rate: ${((passed / tests.length) * 100).toFixed(0)}%`);
    console.log("=".repeat(70));

    // Write report
    const reportPath = join(ARTIFACTS_DIR, "e2e-report.md");
    const ts = new Date().toISOString().replace("T", " ").substring(0, 19);

    let md = `# E2E Test Report — \`tmf test\` (PR #41)\n\n`;
    md += `**Date:** ${ts}\n`;
    md += `**Status:** ${failed === 0 ? "PASSING ✅" : "FAILING ❌"}\n\n`;
    md += `## Summary\n`;
    md += `- Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}\n\n`;

    if (failed > 0) {
      md += `## Failed Tests\n\n`;
      for (const r of results) {
        if (!r.pass) {
          md += `### ${r.name}\n`;
          md += `- exitCode: ${r.exitCode}\n`;
          if (r.stdout) md += `- stdout: \`${r.stdout.substring(0, 200)}\`\n`;
          if (r.stderr) md += `- stderr: \`${r.stderr.substring(0, 200)}\`\n`;
          if (r.error) md += `- error: \`${r.error}\`\n`;
          md += "\n";
        }
      }
    }

    md += `## All Results\n\n`;
    for (const r of results) {
      md += `- ${r.pass ? "✅" : "❌"} **${r.name}** (exit: ${r.exitCode})\n`;
    }
    md += `\n## Artifacts\n\n`;
    md += `- Report: ${reportPath}\n`;

    writeFileSync(reportPath, md, "utf-8");
    console.log(`\nReport saved to: ${reportPath}`);
  } finally {
    restoreSettings(saved);
    await stopMockServer();
  }
}

runAll().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
