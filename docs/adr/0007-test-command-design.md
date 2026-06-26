# ADR-0007: `test` 命令设计

## Status

Accepted (2026-06-26)

## Context

Issue [#8](../../issues/8) 要求实现 `tmf test <provider>` 命令，对指定 Provider 发起流式 Chat Completion 请求，测量延迟、Token 消耗、速率，输出测试报告。

命令全凭本地发起，不经过 Token魔方 API。设计涉及度量定义、参数解析链、SSE 流式解析策略、usage 字段容错、输出格式等交叉决策。

## Decisions

### 1. 三项度量定义

| 指标 | 定义 | 采集方式 |
|------|------|---------|
| **Latency（延迟）** | Time-to-First-Token（TTFT），从发送请求到收到第一个 SSE chunk 的耗时 | 记录 `Date.now()` 差值 |
| **Token Usage（Token 消耗）** | `prompt_tokens + completion_tokens`，从最终 SSE chunk 的 `usage` 字段读取，以 K 展示 | 解析流式最后带 `usage` 的 chunk |
| **Throughput（速率）** | `completion_tokens / (total_time - TTFT)`，仅生成阶段的产出速率，token/秒 | 计算得出 |

### 2. CLI 接口与参数解析

```
tmf test <provider> [--model <model>] [--key <key>] [--prompt <prompt>]
```

`baseUrl` 不暴露为 CLI 标志，通过自动 fallback 链解析：

| 参数 | 优先级 1 | 优先级 2 | 优先级 3 |
|------|---------|---------|---------|
| `apiKey` | `--key` | `settings.json` per-provider 记忆 | 交互询问（隐藏回显） |
| `model` | `--model` | `settings.json` per-provider 记忆 | `ask` API → `defaultModel` |
| `baseUrl` | — | `settings.json` per-provider 记忆 | `ask` API → `baseUrl` |
| `prompt` | `--prompt` | 内置默认提示词 | — |

解析全部失败（无 baseUrl 或 apiKey）→ 报错退出。`test` 不写回 `settings.json`。

### 3. 网络协议：流式 SSE，无非流式 fallback

- 请求携带 `stream: true`
- 请求携带 `stream_options: { include_usage: true }`（提高 usage 返回率）
- 不支持流式的 Provider → 报错「该供应商不支持流式传输，无法测试延迟」
- HTTP 客户端：零依赖，`fetch` + 手写 SSE 解析器

理由：TTFT 必须通过第一个 SSE chunk 的时间戳获得，非流式只能得到总时间，无法区分网络延迟与生成耗时。手写 SSE 解析器避免引入外部依赖，且能精确控制第一个 chunk 的 TTFT 记录时机。

### 4. 请求构造

- 端点：`{baseUrl}/v1/chat/completions`（不做路径推断，baseUrl 是什么就用什么）
- 超时：30 秒（30 秒内未收到第一个 token → 判定 Unreachable）
- Payload：标准 OpenAI Chat Completion 格式

### 5. 默认提示词

```
Hello, please introduce yourself in one sentence.
```

英文以消除跨模型翻译噪音；约 16 token，成本极小；一句话限定避免无限制生成。

`--prompt ""`（空字符串）→ 报错。

### 6. usage 字段容错

1. 请求带 `stream_options: { include_usage: true }`（促使用法返回）
2. 解析所有 SSE chunk，取最后一个包含 `usage` 字段的值
3. 全程无 `usage` → **报错「响应数据异常，无法提取 Token 消耗」**，不估算

理由：无 `prompt_tokens` 的估算值不可靠，不如明确承认无法测量。

### 7. 输出格式

**简版（默认）**：

```
🔍 正在测试 packcode（deepseek-v4-pro）…
   端点：https://api.deepseek.com/openai

测试完成  延迟 200ms  Token 消耗 0.8K  速率 50 token/秒
```

**详版（`--verbose`）**：

```
🔍 正在测试 packcode（deepseek-v4-pro）…
   端点：https://api.deepseek.com/openai
   提示词：Hello, please introduce yourself in one sentence.

   首 token 到达：200ms
   Token 消耗：813（prompt: 42, completion: 771）
   生成耗时：15.4s
   速率：50.1 token/秒
```

**错误场景**：

| 场景 | 输出 |
|------|------|
| Provider 无 baseUrl | `无法获取 {name} 的 API 地址，请先执行 tmf use {name} 配置该供应商` |
| 无 API Key | `请提供 {name} 的 API Key（--key 或 tmf use {name} 预先配置）` |
| Unreachable | `延迟 N/A，无法访问` |
| HTTP 401 | `认证失败（状态码: 401），请检查 API Key 是否正确` |
| HTTP 5xx | `{name} 服务异常（状态码: {code}），请稍后重试` |
| 无 usage 字段 | `响应数据异常，无法提取 Token 消耗` |
| 网络错误 | `请检查网络连接` |

### 8. 模块结构

```
code/cli/src/
├── commands/
│   └── test.ts                # 命令入口 + 参数解析 + 输出格式化
├── providers/
│   ├── api.ts                 # [已有] Token魔方 API 调用
│   └── tester.ts              # [新增] Provider 连通性测试（纯函数）
├── config/
│   └── settings.ts            # [已有] 读写 ~/.tokenmofang/settings.json
└── types/
    └── provider.ts            # [已有] 类型定义 + TestParams, TestResult
```

`providers/tester.ts` 接口：

```ts
interface TestParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs: number;       // default 30000
}

interface TestResult {
  accessible: boolean;
  latencyMs: number | null;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  throughput: number | null;
}

async function testProvider(params: TestParams): Promise<TestResult>;
```

`testProvider` 是纯函数：入参配置，出参结构化结果，不做任何输出。格式化与打印归 `commands/test.ts`。

## Consequences

- 新增 `providers/tester.ts` 模块（SSE 流式解析 + 度量采集）
- 新增 `commands/test.ts` 命令入口
- `types/provider.ts` 新增 `TestParams`、`TestResult` 类型
- 不写 `settings.json`，纯只读
- 零新增依赖（仅用 Node.js 内建 `fetch`）
- 不支持流式的 Provider → 明确报错，不做非流式降级
