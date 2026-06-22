# ADR-0007: write.ts 合并写入设计

## Status

Accepted (2026-06-22)

## Context

pazi 的 merge 阶段产出 `merged.json`（`MergedResult`），需通过 write 阶段写入 `providers.yaml`。核心约束：

- 手工维护的条目**永不自动覆盖**
- pazi 新条目追加到 YAML 末尾
- 已存在条目有字段差异时，标注 `# ⚠ REVIEW:` 注释供人类裁决
- 写入前创建 `.bak` 备份

三个外部源中，hvoy.ai 已被标记为**不可信源**并从 registry 移除。当前活跃源为 `tokensqc` 和 `ztest`（按 registry 注册顺序，tokensqc 优先级高于 ztest）。

## Decisions

### 1. 纯函数 + 干运行双出口

`write(merged, yamlPath?)` 执行实际写入；`dryWrite(merged, yamlPath?)` 返回相同的 `WriteReport` 但不写文件、不创建 `.bak`、不调缓存失效。Agent/skill 层用 `dryWrite` 预览变更，人类确认后调用 `write`。

### 2. 结构化 WriteReport 替代文本 diff

`WriteReport` 包含新增列表、冲突列表、逐字段变更详情，而非原始文本 diff。避免 YAML 序列化格式差异导致的噪音。

### 3. CST 保留格式

使用 eemeli/yaml 的 Document API 解析 YAML 为 CST（Concrete Syntax Tree），修改节点后序列化时保留原有缩进、引号风格、注释和空行。冲突注释通过 CST 在目标字段前插入 Comment 节点。

### 4. 冲突注释两层结构

```
# ⚠ REVIEW: yaml=<现有值>, merged=<合并值> (source1=<v1>, source2=<v2>)
```

- 第一层：YAML 手工值 vs merged 值
- 第二层（括号内）：仅当 merge 阶段检测到多源分歧时出现
- 同值不产生注释
- 缺失字段标记 `(缺失)`

### 5. 源信任分级

| 源 | 可信度 | 状态 |
|----|--------|------|
| tokensqc | 可信 | 活跃 |
| ztest | 可信 | 活跃 |
| hvoy | 不可信 | 已移除 |

源信任分级影响 merge 阶段的多源分歧解决：可信源之间的分歧标 REVIEW 注释；不可信源的数据直接丢弃。

### 6. 所有已存在条目永不覆盖

不区分「手工维护」和「pazi 写入」——任何已存在于 `providers.yaml` 的条目都不会被覆盖。pazi 第二次运行时，之前写入的条目享有同等保护。

## Consequences

| 影响 | 说明 |
|------|------|
| 人工成本 | 每次 merge 需要人类审核冲突注释并裁决 |
| 数据新鲜度 | pazi 第二次运行无法自动更新已有条目，需要人类主动处理 REVIEW 注释 |
| 工具链 | write.ts 需要 eemeli/yaml 的 CST API（`parseDocument`、`YAMLMap`、`Comment` 节点） |
| 技能 | pazi skill 需包含源信任分级和冲突裁决 spec |
