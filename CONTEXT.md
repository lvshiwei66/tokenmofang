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
