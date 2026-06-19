# ADR-0001: `use` 命令设计

## Status

Accepted (2026-06-18)

## Context

Issue [#7](../../issues/7) 要求实现 `tmf use` 命令，将指定 AI 应用的配置切换为目标 Provider。核心流程：备份 → 改写配置文档 → 输出结果。

设计过程中与 `setup` 命令的职责边界、配置改写策略、Provider 信息获取方式、持久化方案等交叉问题需要明确。

## Decisions

### 1. Provider 信息获取

- CLI 本地维护 per-provider 记忆（`~/.tokenmofang/settings.json`），记录 apiKey、model、baseUrl
- `use` 时先查记忆，命中则自动填充参数
- 记忆中没有 → 调用 `ask` API 查询 Provider 详情（baseUrl、defaultModel 等）
- `ask` API 先实现 mock 版本，返回 `ProviderInfo { name, baseUrl, defaultModel, models, intro }`
- 命令行 `--key`、`--model` 可覆盖记忆，并更新记忆

### 2. `setup` 命令废弃

- `setup` 改为惰性按需调用，不再作为独立命令
- 检测逻辑（`detectAllApps()`）保留为内部工具函数
- `~/.tokenmofang/` 不再保存 detection report，改为保存用户设置和指纹

### 3. 配置改写：Appfit 模式

- 每个应用一个 Appfit 实现（`codex`、`claude-code`、`openclaw`）
- Appfit 接口：

```ts
interface Appfit {
  name: string;
  resolveConfigPaths(appPath: string): string[];
  apply(appPath: string, params: UseParams): Promise<void>;
}

interface UseParams {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model?: string;  // 可选，不提供则不修改
}
```

- Appfit 负责推断配置文件路径、解析、修改字段、写入
- 一个 Appfit 可管理多个配置文件（如 Codex 的 `config.toml` + `auth.json`）
- 备份由调用方（`use` 命令）通过 `fs.copyFile` 完成，Appfit 不参与备份
- Appfit 失败抛出异常

### 4. 配置解析库

- TOML: `smol-toml`
- JSON: 原生 `JSON.parse` / `JSON.stringify`
- YAML: `yaml`（npm 包）
- 不保留注释和格式（第一版不处理）

### 5. 备份策略

- 切换前对每个配置文档创建 sibling `.bak`（如 `config.toml` → `config.toml.bak`）
- `.bak` 已存在则覆盖
- 写入失败时已创建的部分 `.bak` 保留（回滚检测时会发现）

### 6. 失败处理

- 不自动重试
- App 未安装 → 调用检测，提示用户手动重试
- 其他失败（I/O、解析、权限）→ 中文错误信息，退出非零

### 7. CLI 接口

```
tmf use <provider> [--key <api-key>] [--model <model>] [--app <app>]
```

- `<provider>`：必选，Provider 名称
- `--key`：可选；未提供 → 记忆 → 交互询问（隐藏回显）
- `--model`：可选；未提供不修改配置中的模型字段
- `--app`：可选；单应用自动选择，多应用未指定时报错

### 8. 持久化

- `~/.tokenmofang/settings.json`：

```json
{
  "clientId": "xxx",
  "providers": {
    "packcode": {
      "apiKey": "sk-xxx",
      "model": "deepseek-v4-pro",
      "baseUrl": "https://api.deepseek.com/openai"
    }
  }
}
```

- per-provider 记忆，不同 provider 独立存储

### 9. 测试策略

- **Appfit 单元测试**：临时目录 + 真实 TOML/JSON/YAML 库，验证读写往返
- **use 集成测试**：mock `ask` + mock stdin，真实临时文件系统
- E2E 暂不做（CI 无真实应用环境）

### 10. 模块结构

```
code/cli/src/
├── commands/use.ts           # 命令入口 + 流程编排
├── appfits/
│   ├── types.ts              # Appfit 接口
│   ├── codex.ts
│   ├── claude-code.ts
│   └── openclaw.ts
├── config/
│   └── settings.ts           # 读写 ~/.tokenmofang/settings.json
├── providers/
│   └── ask.ts                # ask API 调用
└── types/
    └── provider.ts           # ProviderInfo, UseParams
```

## Consequences

- `setup` 命令移除，简化为内部惰性检测
- 新增 `appfits/`、`config/`、`providers/` 三个模块
- `detectors/` 模块保留，持续扩展新应用
- `ask` API mock 需提前实现以支撑 `use` 开发
