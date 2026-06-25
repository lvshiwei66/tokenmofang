# Token魔方 (tokenmofang)

管理和切换本地 AI 应用中第三方大语言模型提供商（Provider）的工具。CLI 运行在用户机器上，通过云端 API 获取提供商清单；本地操作（切换、回滚、检测）直接读写应用配置文件。

## Language

**Provider（供应商）**:
第三方大语言模型服务商，提供 API 接口供 AI 应用调用。
_Avoid_: 服务商, 厂商, vendor


**Appfit（应用适配器）**:
每个 App 的配置改写实现。负责推断该 App 的配置文件路径、解析配置文档、替换字段值并写回。一个 Appfit 可管理多个配置文件（如 Codex 的 config.toml + auth.json）。
_Avoid_: adapter, 适配器, config modifier
**App（应用）**:
用户本地安装的 AI 编程助手或 Agent 工具（如 Codex、Claude Code、OpenClaw），每个应用有各自的配置文件和模型提供商设置。
_Avoid_: 客户端, 工具, client

**Model（模型）**:
Provider 提供的大语言模型标识（如 gpt-5.5、claude-4），App 通过配置指定使用哪个模型。
_Avoid_: 模型名称, LLM

**Detection（应用检测）**:
惰性的本地 AI 应用扫描过程，由 `detectAllApps()` 执行。按需运行（非独立命令），返回已安装 App 的名称、版本、安装路径。
_Avoid_: setup, 扫描结果, 调查报告

**Config Document（配置文档）**:
App 自身的配置文件（TOML / JSON / YAML），包含 Provider、Model、API Key 等设置。Token魔方通过读写此文件实现切换。
_Avoid_: 设置文件, 配置

**Backup（备份）**:
切换前对配置文档的副本，与原始文件同目录，以 `.bak` 后缀结尾（如 `settings.json.bak`），用于回滚。
_Avoid_: 快照, 存档

**Rollback（回滚）**:
从备份文件恢复配置文档，撤销上一次切换操作。
_Avoid_: 恢复, 还原

**Client Registration（客户端注册）**:
CLI 首次需要调用 API 时生成机器指纹，向 API 注册获取 `x-client-id`。后续请求携带此 ID 用于速率限制和身份识别。注册幂等，同一机器多次注册返回相同 ID。
_Avoid_: 设备绑定, 激活

**Rate Limiting（速率限制）**:
API 对 `list` 和 `ask` 接口实施的访问控制：每个客户端每分钟最多 8 次请求，固定窗口算法。
_Avoid_: 限流, 频控

**API Key**:
Provider 签发给用户的密钥，CLI 写入 App 配置文档以通过 Provider 的身份验证。CLI 按 Provider 记忆用户输入的 Key（`~/.tokenmofang/settings.json`），下次 use 同一 Provider 时自动填充。
_Avoid_: 密钥, token, secret

**pazi**:
Provider 数据采集系统。从外部站点抓取 AI API 中转站信息，合并写入 Provider Listing。私有组件，不对终端用户暴露。
_Avoid_: crawler, scraper, 爬虫

**Extractor（提取器）**:
pazi 中的单数据源抓取模块。每个外部站点对应一个 Extractor，实现统一的 `Extractor` 接口，输出标准化的 RawProvider 列表。
_Avoid_: 采集器, fetcher

**RawProvider（原始供应商数据）**:
Extractor 输出的中间数据结构，包含从外部站点抓取的原始字段（name, intro, models, latency 等）。不直接写入 Provider Listing，需经 merge 和人工审核。
_Avoid_: 原始数据, raw data

**Provider Listing（供应商清单）**:
`providers.yaml` 文件，包含所有已知 Provider 的结构化数据。API 从此文件加载数据服务 list/ask 接口。由人工维护 + pazi 追加合并共同构建。
_Avoid_: 提供商列表, registry

**Merge（合并）**:
pazi 将多源 RawProvider 去重合并为 MergedResult 的过程。纯函数，不碰 providers.yaml。两阶段流水线：merge.ts → merged.json → write.ts → providers.yaml。
_Avoid_: 聚合, 归并

**Manual Provider List（手工维护名单）**:
pazi config.ts 中定义的 `MANUAL_PROVIDERS: string[]` 常量，列出由人类手工维护的 Provider 名称。名单内条目 pazi 完全跳过（不覆盖、不标 REVIEW）。名单增减直接生效。归一化名称后精确匹配。参见 ADR-0008。
_Avoid_: 手工列表, 黑名单

**Conflict Resolution（冲突裁决）**:
（已废弃，由 ADR-0008 信任分级策略替代）write.ts 发现已存在条目与 merged 数据有字段差异时，在 YAML 中以 `# ⚠ REVIEW:` 注释标记，由人类审核后手动决定保留哪个值。同值不标记。
_Avoid_: 冲突解决, 差异处理

**Silent Override（静默覆盖）**:
信任分级策略下，pazi 对非手工维护且无未审核 REVIEW 的既有条目，通过 CST API 原地修改差异字段值为 merge 产出值的过程。merge 产出为空值（null/undefined/""/[]）时不覆盖 YAML 原值。覆盖后不写 REVIEW 注释。参见 ADR-0008。
_Avoid_: 自动覆盖, 静默更新

**Unreviewed Review（未审核 REVIEW）**:
YAML 条目 commentBefore 中包含 `⚠ REVIEW:` 前缀时，该条目尚未被人类审核。pazi 跳过此类条目，等人类手动删除 REVIEW 注释后转为可维护状态。参见 ADR-0008。
_Avoid_: 待审核注释, 未处理标记

**Collaborating Sources（参与源）**:
`MergedProvider.contributingSources: string[]`，记录参与合并的数据源 ID 列表（按注册顺序）。用于新条目 REVIEW 注释中的源标识（如 `tokensqc+ztest`）。参见 ADR-0008。
_Avoid_: 合并源, 数据来源

**Write Report（写入报告）**:
write.ts 返回的结构化变更摘要，含新增列表（`added`）、跳过列表（`skipped`）、逐字段变更详情（`changes`）。供 Agent/skill 层展示给人类确认。
_Avoid_: 写入结果, 变更日志
**scrawl.ts（单源抓取命令）**:
pazi CLI 入口之一：对指定数据源执行单次提取，输出 raw JSON 到 `data/extracts/`。接受位置参数 `sourceId` 和 `--headless` flag。stdout 输出 `SingleSourceOutput` JSON。
_Avoid_: 抓取脚本, fetch script

**run.ts（全自动 Runner）**:
pazi CLI 入口之一：并行 spawn 所有已注册 scrawl 子进程，收集结果后调用 merge，stdout 输出 `RunnerOutput` JSON。零参数，支持 `--headless` 传递给子进程。退出码：全部成功 0，任何源失败非 0。
_Avoid_: 编排器, orchestrator

**Merge CLI（合并命令行）**:
pazi CLI 入口之一：扫描 `data/extracts/raw-*.json`，调用 `merge()` 纯函数，输出 `merged.json`。stdout 输出 `MergeOutput` JSON（含 `totalUnique`、`conflictCount`、`artifact` 路径）。不依赖 registry。
_Avoid_: 合并脚本, merge script

**Commands Directory（命令目录）**:
pazi 中 `src/commands/` 目录，集中放置所有 CLI 入口脚本（`scrawl.ts`、`merge.ts`、`run.ts`），与纯函数模块（`src/extractors/`）分离。
_Avoid_: CLI 目录, bin 目录

**SingleSourceOutput（单源抓取输出）**:
`scrawl.ts` 的 stdout JSON 契约：包含 `mode: "single"`、`source`、`status`、`count`、`durationMs`、`artifact`（raw JSON 路径），失败时含 `error`。
_Avoid_: scrawl 结果, 单源报告

**MergeOutput（合并输出）**:
Merge CLI 的 stdout JSON 契约：包含 `totalUnique`、`conflictCount`、`artifact`（merged.json 绝对路径）。
_Avoid_: merge 结果, 合并报告

**RunnerOutput（Runner 输出）**:
`run.ts` 的 stdout JSON 契约：包含 `ok: boolean`、`sources: Record<string, SingleSourceOutput>`（每源抓取状态）、`totalUnique`、`conflictCount`、`artifacts: { merged }`。
_Avoid_: run 结果, 全量报告

**pazi:extract（提取技能）**:
Superpowers skill 的 slash command 名称（`/pazi:extract`）。Model-invoked + User-invoked：Agent 检测到 run.ts 失败时自动激活交互模式；人类也可手动触发。SKILL.md 源文件位于 `agent/pazi/skills/extract-providers/`，经部署脚本同步到 `~/.claude/skills/` 和 `~/.pi/agent/skills/`。
_Avoid_: extract-providers, 抓取技能
