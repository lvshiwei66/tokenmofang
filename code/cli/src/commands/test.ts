import { Command } from "commander";
import { testProvider } from "../providers/tester.js";
import { fetchProviderInfo } from "../providers/api.js";
import { readSettings } from "../config/settings.js";
import { TestError } from "../types/provider.js";
import type { TestParams } from "../types/provider.js";

const DEFAULT_PROMPT = "Hello, please introduce yourself in one sentence.";
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------
// Parameter resolution (fallback chain per ADR-0007 §2)
// ---------------------------------------------------------------

interface ResolvedParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

async function resolveParams(
  providerName: string,
  opts: { model?: string; key?: string; prompt?: string },
): Promise<ResolvedParams> {
  const settings = readSettings();
  const providerSettings = settings.providers?.[providerName] ?? {};

  // --- apiKey: --key → settings.json → error ---
  const apiKey = opts.key ?? providerSettings.apiKey;
  if (!apiKey) {
    throw new TestError(
      `请提供 ${providerName} 的 API Key（--key 或 tmf use ${providerName} 预先配置）`,
      "NO_API_KEY",
    );
  }

  // --- baseUrl: settings.json → ask API → error ---
  let baseUrl: string | undefined = providerSettings.baseUrl;

  if (!baseUrl) {
    const info = await fetchProviderInfo(providerName);
    baseUrl = info?.baseUrl;
  }

  if (!baseUrl) {
    throw new TestError(
      `无法获取 ${providerName} 的 API 地址，请先执行 tmf use ${providerName} 配置该供应商`,
      "NO_BASE_URL",
    );
  }

  // --- model: --model → settings.json → ask API → error ---
  let model: string | undefined = opts.model ?? providerSettings.model;

  if (!model) {
    const info = await fetchProviderInfo(providerName);
    model = info?.defaultModel;
  }

  if (!model) {
    // Last resort: use a commonly available model name
    // The request will fail with a clear error if the model doesn't exist
    throw new TestError(
      `无法确定 ${providerName} 的默认模型，请使用 --model 指定`,
      "NO_BASE_URL",
    );
  }

  // --- prompt: --prompt → built-in default ---
  const prompt = opts.prompt ?? DEFAULT_PROMPT;
  if (prompt.trim().length === 0) {
    throw new TestError("提示词不能为空", "EMPTY_PROMPT");
  }

  return { baseUrl, apiKey, model, prompt };
}

// ---------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------

function formatTokenUsage(total: number): string {
  const k = total / 1000;
  return `${k.toFixed(k < 10 ? 1 : 0)}K`;
}

function formatDefault(result: Awaited<ReturnType<typeof testProvider>>): void {
  const { latencyMs, tokenUsage, throughput } = result;
  console.log();
  console.log(
    `测试完成  延迟 ${latencyMs}ms  Token 消耗 ${formatTokenUsage(tokenUsage!.total)}  速率 ${throughput} token/秒`,
  );
}

function formatVerbose(
  result: Awaited<ReturnType<typeof testProvider>>,
  params: ResolvedParams,
): void {
  const { latencyMs, tokenUsage, throughput } = result;
  const generationTime = tokenUsage
    ? (tokenUsage.completion / (throughput ?? 1)) * 1000
    : 0;

  console.log();
  console.log(`   提示词：${params.prompt}`);
  console.log();
  console.log(`   首 token 到达：${latencyMs}ms`);
  console.log(
    `   Token 消耗：${tokenUsage!.total}（prompt: ${tokenUsage!.prompt}, completion: ${tokenUsage!.completion}）`,
  );
  console.log(`   生成耗时：${(generationTime / 1000).toFixed(1)}s`);
  console.log(`   速率：${throughput} token/秒`);
}

function resolveDisplayModel(params: ResolvedParams): string {
  return params.model;
}

// ---------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------

export function registerTestCommand(program: Command): void {
  program
    .command("test <provider>")
    .description("测试 Provider 健康状况（延迟、Token 消耗、速率）")
    .option("-m, --model <model>", "指定模型")
    .option("-k, --key <key>", "API Key")
    .option("-p, --prompt <prompt>", "自定义提示词")
    .option("-v, --verbose", "详细输出")
    .action(async (provider: string, opts: Record<string, string | boolean>) => {
      try {
        const resolved = await resolveParams(provider, {
          model: typeof opts.model === "string" ? opts.model : undefined,
          key: typeof opts.key === "string" ? opts.key : undefined,
          prompt: typeof opts.prompt === "string" ? opts.prompt : undefined,
        });

        const testParams: TestParams = {
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
          model: resolved.model,
          prompt: resolved.prompt,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        };

        // Header
        const displayModel = resolveDisplayModel(resolved);
        console.log(`🔍 正在测试 ${provider}（${displayModel}）…`);
        console.log(`   端点：${resolved.baseUrl}`);

        const result = await testProvider(testParams);

        if (!result.accessible) {
          console.log();
          console.log("延迟 N/A，无法访问");
          process.exit(1);
        }

        if (opts.verbose) {
          formatVerbose(result, resolved);
        } else {
          formatDefault(result);
        }
      } catch (err: unknown) {
        if (err instanceof TestError) {
          console.error(err.message);
          process.exit(1);
        }
        // Unexpected errors
        console.error(`测试失败：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
