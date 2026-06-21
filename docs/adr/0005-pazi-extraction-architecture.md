# ADR-0005: pazi 提取系统架构

## Status

Accepted (2026-06-21)

## Context

Token魔方需要从三个外部站点（hvoy.ai、ztest.ai、tokensqc.com）定期抓取 AI API 中转站供应商列表，合并入库到 `providers.yaml`。提取逻辑涉及 Playwright 浏览器自动化、各站点差异化的抓取策略、人工审核门，需要一个独立的模块承载。

关键约束：
- 提取脚本和策略**禁止开源**（数据来源和采集逻辑为内部资产）
- 提取系统需要对终端用户**完全透明**（CLI 客户不知道数据来源）
- 同时支持**一次性 Runner 模式**和 **Agent 交互模式**（人工审核/冲突裁决）

## Decisions

### 1. pazi 作为独立私有仓库，通过 git submodule 挂载

`pazi` 是独立私有仓库，以 git submodule 形式挂载在公开仓库 `tokenmofang/pazi/`。

公开 clone 者看到空目录；内部开发者通过 `git submodule update --init` 获取内容。

**拒绝的方案**：
- 放在 `code/api/src/extractors/`：与 API 代码耦合，且 API 仓库已私有，但提取逻辑和 API 运行时无关
- 放在公开仓库直接目录：违反「禁止开源」约束

### 2. 纯 Node.js/TypeScript 技术栈

与现有 `code/api` 和 `code/cli` 保持一致。Playwright 通过 npm 依赖引入。

**拒绝的方案**：
- Python + Playwright：跨语言类型共享成本高，需额外序列化层
- 混合栈：维护两套依赖和运行环境

### 3. Runner + Agent 双模式

- **Runner 模式**：`tsx src/run.ts --all`，一次性非交互执行，输出 JSON 摘要。全部成功退出 0，否则非零
- **Agent 交互模式**：加载 Superpowers skill（`pazi/skills/extract-providers/SKILL.md`），Agent 逐步走流程，展示审核门

Runner 失败时 Agent 自动进入交互模式处理失败源和冲突裁决。

### 4. 类型独立定义

`pazi` 不 import `code/api/src/types/provider.ts`。`YamlProvider` 类型在 `pazi/src/types.ts` 中独立定义。两边不一致时，写入的 YAML 加载到 API 会自然报错（字段缺失/多余）。

**拒绝的方案**：
- TypeScript path alias 跨目录引用：破坏仓库边界
- 提取共享类型包：v1 过度工程

### 5. 目录结构

```
pazi/
├── skills/
│   └── extract-providers/SKILL.md
├── src/
│   ├── extractors/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── hvoy.ts
│   │   ├── ztest.ts
│   │   ├── tokensqc.ts
│   │   ├── merge.ts
│   │   └── write.ts
│   ├── run.ts
│   └── types.ts
├── data/extracts/
├── package.json
└── tsconfig.json
```

## Consequences

| 影响 | 说明 |
|------|------|
| 仓库管理 | 新增私有仓库 `pazi`，在 `tokenmofang` 中添加 submodule 引用 |
| 开发者环境 | 需要 `git submodule update --init` 获取 pazi 内容 |
| 部署 | `write.ts` 写入 `providers.yaml` 到父仓库路径，需要约定路径或环境变量 |
| 安全 | pazi 内容绝不会泄漏到公开仓库 |
