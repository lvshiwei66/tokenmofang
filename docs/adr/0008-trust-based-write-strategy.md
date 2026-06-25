# ADR-0008: 信任分级写入策略

## Status

Accepted (2026-06-24)

## Supersedes

ADR-0007 (§6「所有已存在条目永不覆盖」) — 该节被本文档完全替换。ADR-0007 其余章节（结构化 WriteReport、CST 保留格式、冲突注释格式）仍有效。

## Context

ADR-0007 采用「所有已存在条目永不覆盖」策略：任何已在 `providers.yaml` 中的条目，pazi 均不修改其字段值，仅在差异处添加 `# ⚠ REVIEW:` 注释。这导致两个问题：

1. **手工维护条目被标注大量噪音**：deepseek、openai 等大厂条目由人类手动维护，pazi 每次运行都会因抓取数据与人工维护值的自然差异产生大量 REVIEW 注释，人类需反复确认。
2. **pazi 自动维护条目缺乏自动更新**：非手工维护的条目（由 pazi 首次写入）同样被「保护」——第二次运行时即使抓取到更新数据也无法自动刷新，仍产生 REVIEW 注释。

## Decisions

### 1. 手工维护名单

在 pazi 代码库 `config.ts` 中定义 `MANUAL_PROVIDERS: string[]` 常量，列出由人类手工维护的 Provider（按 `normalizeName` 归一化后精确匹配）。

当前名单：`["deepseek", "openai", "anthropic", "google", "scnet"]`。

名单增减直接生效：移除的条目下次运行自动变为 pazi 维护（无需过渡 REVIEW）。

### 2. 信任分级策略表

| 场景 | 行为 |
|------|------|
| 手工名单 + 已在 YAML | **完全跳过**（不覆盖、不标 REVIEW、不产生 FieldChange） |
| 不在手工名单 + 已在 YAML + 无未审核 REVIEW | **静默覆盖**差异字段（merge 空值保护 YAML 原值），变更记录在 `WriteReport.changes` |
| 不在手工名单 + 已在 YAML + 有未审核 REVIEW | **跳过**，等人类先审核 |
| 新条目（YAML 不存在） | **写入** + `# ⚠ REVIEW: 新条目 (sources) — 待审核` |

### 3. 静默覆盖

对非手工维护且无未审核 REVIEW 的既有条目，通过 CST API 修改差异字段的实际值为 merge 产出值。覆盖后**不写** REVIEW 注释。

`null | undefined | "" | []` 视为空值。merge 产出为空时，**不覆盖** YAML 原值（保留人工填入的数据）。

### 4. 未审核检测

检查 YAML 条目的 `commentBefore` 是否包含 `# ⚠ REVIEW:` 前缀。存在未审核 REVIEW 注释的条目，pazi 跳过（等人类审核后手动删除注释）。

### 5. 新条目 REVIEW 注释格式

```
# ⚠ REVIEW: 新条目 (tokensqc+ztest) — 待审核
```

其中 `sources` 部分来自 `MergedProvider.contributingSources`（见 ADR-0006 补充），以 `+` 连接。

### 6. 审核流程 v1

1. `write()` 写入含 `# ⚠ REVIEW:` 注释的新条目
2. Agent 提醒人类有新条目待审核
3. 人类手动编辑 YAML 删除 `# ⚠ REVIEW:` 注释
4. 下次 pazi 运行时，该条目转为「无未审核 REVIEW」状态，可被静默覆盖

### 7. 删除 WriteReport.conflicted

原 `conflicted` 字段在信任分级策略下始终为空（不再有「已存在条目标记冲突但保留原值」的行为）。直接删除该字段。

## Consequences

| 影响 | 说明 |
|------|------|
| 人工成本降低 | 手工维护条目不再产生 REVIEW 噪音；pazi 自维护条目自动更新 |
| 数据安全 | 新条目仍需人类审核（REVIEW 注释），手工条目受保护 |
| 向后兼容 | 无——此为破坏性变更。旧 YAML 上的 REVIEW 注释在新逻辑中被识别为「未审核」标记 |
| Merge 补充 | `MergedProvider` 新增 `contributingSources: string[]`，merge 阶段填充 |
| ADR-0007 部分失效 | §6 被替换，其余章节保留 |
