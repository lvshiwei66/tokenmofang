# ADR-0004: 多协议 URL 设计

## Status

Accepted (2026-06-20)

## Context

不同 AI 应用使用不同的 API 协议：

- **Codex**：OpenAI 兼容协议（`/v1/chat/completions`）
- **Claude Code**：Anthropic Messages 协议
- **OpenClaw**：取决于 provider

许多大模型提供商同时提供两种协议的端点，路径不同。例如 DeepSeek：OpenAI 端点在 `https://api.deepseek.com/v1`，Anthropic 端点在 `https://api.deepseek.com/anthropic`。

当前 `ProviderDetail.baseUrl` 是单一字符串，Appfit 无法区分应使用哪个协议的 URL。这导致 Claude Code Appfit 写入的 `ANTHROPIC_BASE_URL` 可能是 OpenAI 格式的 URL（如 `https://api.scnet.cn/api/llm/v1`），Claude Code 无法正确通信。

## Decisions

### 1. Provider 数据模型：`baseUrl` → `urls`

Provider YAML 和 API 响应中用 `urls` map 替代单一 `baseUrl`：

```yaml
urls:
  default: "https://api.scnet.cn/api/llm/v1"    # 必填，兜底
  openai: "https://api.scnet.cn/api/llm/v1"      # 可选
  anthropic: "https://api.scnet.cn/api/anthropic" # 可选
```

- `default` 必填，当 app 无法判断协议时使用
- `openai` / `anthropic` 可选，不存在时 fallback 到 `default`
- 硬切换：直接改 `ProviderDetail` 字段，不留兼容过渡（当前仅 CLI 一个消费者）

### 2. Appfit 接口：新增 `requiredProtocol()`

```ts
interface Appfit {
  name: string;
  resolveConfigPaths(appPath: string): string[];
  requiredProtocol(): "openai" | "anthropic" | undefined;
  apply(appPath: string, params: UseParams): Promise<void>;
}
```

- 返回 `"openai"` → 从 `urls.openai ?? urls.default` 取 URL
- 返回 `"anthropic"` → 从 `urls.anthropic ?? urls.default` 取 URL
- 返回 `undefined` → 使用 `urls.default`

各 Appfit 实现：

| Appfit | protocol |
|--------|----------|
| `codex` | `"openai"` |
| `claude-code` | `"anthropic"` |
| `openclaw` | `undefined` |

### 3. `UseParams` 保持 `baseUrl: string`

URL 解析集中在 `useCommand` 中完成。Appfit 拿到的仍是解析后的单 URL，接口签名不变。

```ts
const url = urls[appfit.requiredProtocol() ?? "default"] ?? urls["default"];
```

### 4. `ProviderMemory` 存储完整 `urls`

```ts
interface ProviderMemory {
  apiKey: string;
  model?: string;
  urls: Record<string, string>;  // 原: baseUrl: string
}
```

持久化示例：

```json
{
  "providers": {
    "scnet": {
      "apiKey": "sk-xxx",
      "model": "MiniMax-M2.5",
      "urls": {
        "default": "https://api.scnet.cn/api/llm/v1",
        "openai": "https://api.scnet.cn/api/llm/v1",
        "anthropic": "https://api.scnet.cn/api/anthropic"
      }
    }
  }
}
```

- 存储完整 `urls` 而非解析后的单 URL，确保同一 provider 在不同 app 间切换时无需重新调 API

### 5. `useCommand` URL 解析流程

```
1. 查 ProviderMemory → 有 urls → 直接用
2. 无 → 调 API 拿 ProviderDetail.urls → 更新 memory
3. appfit.requiredProtocol() → 从 urls 解析 URL
4. params.baseUrl = 解析结果
5. appfit.apply(path, params)
6. memory.urls = urls（完整保存）
```

## Consequences

| 层 | 文件 | 变更 |
|---|------|------|
| 数据 | `providers.yaml` | `baseUrl` → `urls` |
| API 类型 | `providersStore.ts` | `YamlProvider` / `ProviderDetail` 字段变更 |
| CLI 类型 | `provider.ts` | `ProviderDetail.baseUrl` → `urls`，`ProviderMemory.baseUrl` → `urls` |
| Appfit 接口 | `appfits/types.ts` | 新增 `requiredProtocol()` |
| Appfit 实现 | `claude-code.ts` | `requiredProtocol(): "anthropic"` |
| Appfit 实现 | `codex.ts` | `requiredProtocol(): "openai"` |
| Appfit 实现 | `openclaw.ts` | `requiredProtocol(): undefined` |
| 命令 | `use.ts` | URL 解析逻辑 + 记忆存取适配 |
| 命令 | `ask.ts` | 接口适配 |
| 测试 | 多个 | 同步更新 |
