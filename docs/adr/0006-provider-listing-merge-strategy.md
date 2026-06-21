# ADR-0006: Provider Listing 合并策略

## Status

Accepted (2026-06-21)

## Context

`providers.yaml` 是 Provider Listing 的单一数据源，由两部分构成：

1. **手工维护的条目**：团队直接编辑的一线厂商（如 deepseek、openai、anthropic）
2. **pazi 从外部站点抓取的条目**：AI API 中转站的长尾数据

三个外部源（hvoy.ai、ztest.ai、tokensqc.com）抓取的数据存在重叠和冲突。需要一套合并策略将多源数据写入同一个 `providers.yaml`，同时保护手工维护的条目不被覆盖。

## Decisions

### 1. 追加合并，现有条目优先

- 手工维护的条目**永不自动覆盖**
- pazi 新条目追加到 YAML 末尾
- 当 pazi 抓到的 provider 与现有条目同名（归一化后）时：**不覆盖**，仅在冲突字段旁加 YAML 注释 `# ⚠ REVIEW:`
- 如果手工条目需要更新，由人类在审核阶段手动处理

### 2. 去重键：`name` 归一化

归一化规则：NFKC 标准化 → 小写 → 删除所有 Unicode 空白字符（`\p{Zs}` + `\t\n\r`）。

`"Packy Code"`、`"packycode"`、`"Ｐａｃｋｙ　Ｃｏｄｅ"`（全角）均归一化为 `"packycode"`。

### 3. 冲突标记

多源对同一 provider 的同一字段有不同值时，取第一个源的值写入 YAML，冲突以注释标记：

```yaml
# ⚠ REVIEW: hvoy=180ms, tokensqc=220ms
latency: 180

# ⚠ REVIEW: hvoy=["旗舰","Claude"], tokensqc=["旗舰","高性价比"]
tags:
  - 旗舰
  - Claude
```

来源按 registry 注册顺序（hvoy > ztest > tokensqc）确定优先级。

### 4. 三源间的字段合并

| 字段 | 合并策略 |
|------|---------|
| `models` | 并集，保持首次出现顺序 |
| `tags` | 并集，大小写不敏感去重 |
| `latency` | 取首个源的值，冲突标记 |
| `price` | 取首个源的值，冲突标记 |
| 其余字段 | 取首个源的值 |

### 5. 合并两层流水线

```
raw-*.json → merge.ts → merged.json → write.ts → providers.yaml
```

- `merge.ts`：纯函数，三源去重合并 → `merged.json`（含冲突列表）。不碰 `providers.yaml`。
- `write.ts`：读现有 `providers.yaml` + `merged.json`，追加新条目、标记冲突、写入。写入前创建 `.bak`。

### 6. 字段缺失默认值

| 字段 | 缺失时 | 说明 |
|------|--------|------|
| `name` | **跳过条目** | 硬性要求 |
| `intro` | `""` | |
| `website` | `""` | |
| `urls` | `{ default: "" }` | 至少满足 schema 的 `default` 键要求 |
| `defaultModel` | `models[0]` | |
| `models` | `[]` | |
| `latency` | `null` | |
| `price` | `""` | 原始文本，不做格式归一化 |
| `tokensPerSecond` | `null` | |
| `tags` | `[]` | |

## Consequences

| 影响 | 说明 |
|------|------|
| 数据安全 | 手工维护的条目永远不会被自动脚本覆盖 |
| 人工成本 | 每次 merge 需要人类审核冲突注释并裁决 |
| Schema 变更 | `latency` 从 `number` 改为 `number \| null`，影响 `YamlProvider`、`ProviderListItem` 类型 |
| API 兼容 | `latency: null` 的 provider 在 list 端点的响应中需要前端适配 |
