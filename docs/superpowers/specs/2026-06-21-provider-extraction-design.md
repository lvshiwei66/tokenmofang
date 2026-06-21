# Provider Extraction System — Design Spec

## Status

Approved, pending implementation.

## Overview

从三个可信外部数据源（hvoy.ai、ztest.ai、tokensqc.com）提取 AI API 中转站供应商列表，合并写入本系统的 `providers.yaml`。

### 目标

- **最小可行**：先对齐现有 `YamlProvider` schema 入库，后续再扩展字段
- **可验证**：每一步产生可审查的中间产物（JSON），人工审核后才写入
- **可扩展**：新增数据源只需实现统一接口 + 注册一行
- **Agent+Skill 驱动**：Superpowers skill 编排流程，Node.js 脚本执行抓取/合并

## Architecture

```
extractor-1 → raw-1.json ─┐
extractor-2 → raw-2.json ─┼─→ 🛑 人工审核 ─→ merge → merged.json ─→ write → providers.yaml
extractor-N → raw-N.json ─┘
```

三层结构：

1. **Skill 层**（`skills/extract-providers/SKILL.md`）— Agent 调用脚本、汇总报告、拦截人工审核、验证输出
2. **Extractor 层**（`code/api/src/extractors/`）— 每个源一个独立提取器，Playwright 抓取，输出标准化 JSON
3. **Merge/Write 层** — 三源合并、冲突标记（`# REVIEW`）、写入目标 YAML

## Data Schema

### RawProvider（提取器统一输出）

```typescript
interface RawProvider {
  source: "hvoy" | "ztest" | "tokensqc";
  fetchedAt: string;                        // ISO 8601
  name: string;                             // 标准化名称
  intro?: string;
  website?: string;
  urls?: Record<string, string>;
  defaultModel?: string;
  models?: string[];
  latency?: number;
  price?: string;
  tokensPerSecond?: number | null;
  tags?: string[];
}
```

### 映射到 YamlProvider

| 目标字段 | 来源 | 规则 |
|----------|------|------|
| `name` | `name` | 直接 |
| `intro` | `intro` | 截断 ≤ 300 字符 |
| `website` | `website` | 直接 |
| `urls` | `urls` | 必须有 `default` 键 |
| `defaultModel` | `defaultModel` | 直接 |
| `models` | `models` | 直接 |
| `latency` | `latency` | 直接 |
| `price` | `price` | merge 时统一为 `"$X.XX"` |
| `tokensPerSecond` | `tokensPerSecond` | 直接 |
| `tags` | `tags` | 直接 |

### 去重与冲突

- **去重键**：`name` 小写去空格归一化（`"Packy Code"` = `"packycode"`）
- **冲突策略**：三源平等，首次出现入库，冲突字段以 YAML 注释标记 `# ⚠ REVIEW: ...`

```yaml
# ⚠ REVIEW: hvoy=180ms, tokensqc=220ms
latency: 180

# ⚠ REVIEW: hvoy=["旗舰","Claude"], tokensqc=["旗舰","高性价比"]
tags:
  - 旗舰
  - Claude
```

## Per-Source Extraction Strategy

### hvoy.ai

- 页面类型：SPA（数据在 JS bundle 中）
- 方法：Playwright 打开，等表格渲染 → 逐行提取
- 提取字段：name, url, models[], latency, price, tags
- 特殊处理：人民币价格转换、分类标签映射

### ztest.ai

- 页面类型：SPA（`<div id="app">`，数据 API 动态加载）
- 方法：Playwright 拦截网络请求 → API JSON 优先 → DOM 兜底
- 特殊处理：真实性/质量验证结果映射为 tags

### tokensqc.com

- 页面类型：SSR + JSON-LD
- 方法：
  1. fetch `/stations` → 解析 `<script type="application/ld+json">` 获取站名+URL
  2. Playwright 并发访问 `/stations/<slug>` 详情页
  3. 提取 intro, models, urls, tags
- 特殊处理：页面自带分类标签直接复用

### 容错

任一源失败不阻塞其他源。Skill 汇总时报告各源状态。

## Extractor Registry（扩展机制）

```typescript
// code/api/src/extractors/registry.ts
export const SOURCES: SourceConfig[] = [
  { id: "hvoy",    label: "hvoy.ai",    run: () => import("./hvoy.js") },
  { id: "ztest",   label: "ztest.ai",   run: () => import("./ztest.js") },
  { id: "tokensqc", label: "tokensqc.com", run: () => import("./tokensqc.js") },
];
```

新增数据源只需：实现 `Extractor` 接口 + 在 registry 加一行。

## Skill Flow

```
1. 触发 extract-providers skill
2. Agent 并行运行三个提取器脚本
3. 汇总报告各源状态 + raw-*.json 摘要
4. 🛑 人工审核门：确认/拒绝/重跑
5. Agent 运行 merge → merged.json
6. Agent 展示冲突清单，逐条裁决
7. Agent 运行 write → providers.yaml，展示 diff
8. git commit
```

## File Structure

```
tokenmofang/
├── skills/
│   └── extract-providers/SKILL.md    ← Superpowers 技能
├── code/api/src/extractors/
│   ├── types.ts                      ← RawProvider + Extractor 接口
│   ├── registry.ts                   ← 数据源注册表
│   ├── hvoy.ts                       ← hvoy.ai 提取器
│   ├── ztest.ts                      ← ztest.ai 提取器
│   ├── tokensqc.ts                   ← tokensqc.com 提取器
│   ├── merge.ts                      ← 合并 + 冲突标记
│   └── write.ts                      ← 写入 providers.yaml
└── code/api/data/
    ├── providers.yaml                ← 目标 YAML（现有）
    └── extracts/                     ← 中间产物
        ├── raw-hvoy.json
        ├── raw-ztest.json
        ├── raw-tokensqc.json
        └── merged.json
```

## Out of Scope (v1)

- 自动化定时抓取（cron/CI）
- 新 YAML 字段扩展
- CLI 命令封装（`tmf import-providers`）
- 提取器单元测试
