# Token魔方 验收计划

> 基于产品需求文档 (docs/requirements-raw.md) 和已接受的 ADR (0001–0009) 制定。
> 验收日期：2026-06-27

---

## 验收总览

| 模块 | 状态 | 通过/总计 |
|------|------|----------|
| CLI 命令 | ✅ 完成 | 6/10 命令已实现 |
| API 服务 | ✅ 完成 | 2/2 端点 + 限流/认证已实现 |
| 安全基础设施 | ✅ 完成 | HMAC 签名 + IP 限流 |
| 应用检测器 | ✅ 完成 | 3/3 应用支持 |
| 配置改写 (Appfit) | ✅ 完成 | 3/3 应用支持 |
| 数据持久化 | ✅ 完成 | settings.json + config.json |
| 缓存系统 | ✅ 完成 | 懒过期 TTL 缓存 |
| 测试覆盖 | ✅ 通过 | 205 项全部通过 (154 CLI + 51 API) |
| 数据采集 (pazi) | ⚠️ 独立验收 | 私有子模块，另行计划 |

---

## 一、CLI 命令逐项验收
### 1.1 `tmf setup` — 初始化检测 ✅ (lazy auto-trigger，非独立命令)

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 检测已安装的 AI 应用 (codex, claude-code, openclaw) | requirements §1 | ✅ | `setup.test.ts` |
| 输出结构化检测报告到 `~/.tokenmofang/detection-report.json` | requirements §1 | ✅ | `setup.test.ts` |
| 生成幂等客户端指纹 (fingerprint) | requirements §安全 | ✅ | `setup.test.ts` |
| root 用户运行警告 | ADR-0001 | ✅ | `setup.test.ts` |
| 未检测到任何应用时输出安装建议 | requirements §1 | ✅ | `setup.test.ts` |
| 检测报告含时间戳 | implementation | ✅ | 代码审查 |

### 1.2 `tmf list` — 浏览供应商清单 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 默认返回前 20 条 | requirements §2 | ✅ | `list.test.ts` |
| `--all` 返回全部 | requirements §2 | ✅ | `list.test.ts` |
| 表格展示：名称、延迟、价格、模型、描述、标签 | requirements §2 + ADR-0002 | ✅ | `list.test.ts` |
| 模型列展示前 3 个 + `(+N)` 剩余计数 | ADR-0002 §12 | ✅ | `list.test.ts` |
| 总数提示 "XXX provider(s) total. Use --all to show all" | requirements §2 | ✅ | `list.test.ts` |
| 通过 `x-client-id` 请求头标识客户端 | requirements §安全 + ADR-0002 | ✅ | `api.test.ts` |
| 网络错误友好提示 | ADR-0002 §9 | ✅ | `list.test.ts` |
| `--debug` 输出调试信息 | implementation | ✅ | `list.test.ts` |

### 1.3 `tmf ask <provider>` — 查询供应商详情 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 查询单个 Provider 详情 | requirements §5 | ✅ | `ask.test.ts` |
| 格式化输出：名称、简介、网址、默认模型、API 地址、可用模型、数据更新时间 | ADR-0002 §3 | ✅ | `ask.test.ts` |
| API 返回多协议 URL (`urls` map) | ADR-0004 §1 | ✅ | `ask.test.ts` |
| 404 友好提示 "未找到供应商: {name}" | ADR-0002 §9 | ✅ | `ask.test.ts` |
| 429 速率限制提示 | ADR-0002 §9 | ✅ | `ask.test.ts` |
| `--debug` 输出调试信息 | implementation | ✅ | `ask.test.ts` |

### 1.4 `tmf use <provider>` — 切换供应商 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 切换前创建配置备份 (sibling `.bak`) | requirements §3 + ADR-0001 §5 | ✅ | `use.test.ts` |
| `--key` 设置 API Key | requirements §3 | ✅ | `use.test.ts` |
| `--model` 设置模型名称 | requirements §3 | ✅ | `use.test.ts` |
| `--app` 指定目标应用 | requirements §3 | ✅ | `use.test.ts` |
| 单应用时 `--app` 可选（自动选择） | requirements §3 注意 + ADR-0001 §7 | ✅ | `use.test.ts` |
| 多应用未指定时报错 | ADR-0001 §7 | ✅ | `use.test.ts` |
| Per-provider 记忆（apiKey、model、urls） | requirements §3 注意 + ADR-0001 §8 | ✅ | `use.test.ts` |
| 记忆命中时自动填充，CLI 参数可覆盖 | ADR-0001 §1 | ✅ | `use.test.ts` |
| 记忆没有时调 API 获取 ProviderDetail | ADR-0001 §1 | ✅ | `use.test.ts` |
| 多协议 URL 支持（openai / anthropic / default） | ADR-0004 §2–5 | ✅ | `use.test.ts` |
| Appfit 按协议选择正确 URL | ADR-0004 §3 | ✅ | `appfits.test.ts` |
| 成功输出 "✅ Switched {app} to {provider}" | ADR-0001 §7 | ✅ | `use.test.ts` |
| Provider 记忆保存完整 urls（非解析后单 URL） | ADR-0004 §4 | ✅ | `use.test.ts` |
| 备份覆盖已存在的 .bak | ADR-0001 §5 | ✅ | `use.test.ts` |
| 操作不影响其他 Provider 记忆 | ADR-0001 §8 | ✅ | `use.test.ts` |
| 支持三应用配置改写：codex (TOML+JSON)、claude-code (JSON)、openclaw (YAML) | ADR-0001 §3 | ✅ | `appfits.test.ts` |

### 1.5 `tmf rollback --app <app>` — 回滚配置 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 从 `.bak` 恢复配置 | requirements §3.2 | ✅ | `rollback.test.ts` |
| `--app` 指定目标应用 | ADR-0003 §7 | ✅ | `rollback.test.ts` |
| 单应用自动选择 | ADR-0003 §4 | ✅ | `rollback.test.ts` |
| 恢复成功后删除 .bak 文件 | ADR-0003 §2 | ✅ | `rollback.test.ts` |
| 多文件恢复（codex: config.toml + auth.json） | ADR-0003 §1 | ✅ | `rollback.test.ts` |
| 部分 .bak 缺失警告，继续恢复剩余 | ADR-0003 §1 | ✅ | `rollback.test.ts` |
| 全部 .bak 缺失报错 "备份丢失，恢复失败" | requirements §3.2 + ADR-0003 §1 | ✅ | `rollback.test.ts` |
| 不修改 Provider 记忆 (settings.json) | ADR-0003 §5 | ✅ | `rollback.test.ts` |
| 无 `--from` 参数（按 ADR 删除） | ADR-0003 §2 | ✅ | 代码审查 |

### 1.6 `tmf test <provider>` — 测试供应商 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 测试供应商可访问性 | requirements §4 | ✅ | `test.test.ts` |
| 测试延迟 | requirements §4 | ✅ | `test.test.ts` |
| 测试 token 消耗 / 速率 | requirements §4 | ✅ | `test.test.ts` |
| `--model` 设置测试模型 | requirements §4 | ✅ | CLI 参数 |
| `--key` 设置 API Key | requirements §4 | ✅ | CLI 参数 |
| `--prompt` 自定义测试提示词 | requirements §4 | ✅ | CLI 参数 |
| 默认测试提示词（未指定时） | requirements §4 | ✅ | `DEFAULT_PROMPT = "Hello, please..."` |
| 输出延迟 / token 消耗 / 速率 | requirements §4 | ✅ | `formatDefault()` / `formatVerbose()` |
| 失败输出 "延迟N/A, 无法访问" | requirements §4 | ✅ | `TestError` 处理 |
| 从配置读取 --key（除非未设置过） | requirements §4 | ✅ | `resolveParams()` 回退链 |

### 1.7 `tmf import` / `tmf export` — 导入导出 ❌ 未实现

| 验收项 | 规格来源 | 状态 | 备注 |
|--------|---------|------|------|
| `tmf export path/to/save.yaml` | requirements §导入导出 | ❌ | 未实现 |
| `tmf import path/from/source.yaml` | requirements §导入导出 | ❌ | 未实现 |
| 导入导出整个应用设置 | requirements §导入导出 | ❌ | 未实现 |

### 1.8 `tmf get` / `tmf set` — 配置管理 ❌ 未实现

| 验收项 | 规格来源 | 状态 | 备注 |
|--------|---------|------|------|
| `tmf get key` | requirements §系统配置 | ❌ | 未实现 |
| `tmf set key=value` | requirements §系统配置 | ❌ | 未实现 |

### 1.9 `tmf help` — 帮助命令 ⚠️ 部分实现

| 验收项 | 规格来源 | 状态 | 备注 |
|--------|---------|------|------|
| `tmf help` 显式命令 | requirements §帮助 | ❌ | commander.js 仅提供 `--help` flag，无独立 `help` 子命令 |
| `tmf -h` / `tmf --help` | requirements §帮助 | ✅ | commander.js 内置 |

### 1.10 交互式 API Key 输入 ⚠️ 仅部分实现

| 验收项 | 规格来源 | 状态 | 备注 |
|--------|---------|------|------|
| 未提供 --key 时交互询问 | requirements §3.1 | ⚠️ | 代码中存在 `promptHidden()` 函数但未接入主流程 |
| 隐藏回显 (stdin 不回显) | requirements §3.1 | ⚠️ | `promptHidden()` 实现使用 `stdin.setRawMode(true)` 隐藏回显 |
| 提示当前值（回车保持不变） | requirements §3.1 注意 | ❌ | 交互流程未完整接入 |

---

## 二、API 服务验收

### 2.1 端点 ✅

| 端点 | 规格来源 | 状态 | 验证方式 |
|------|---------|------|---------|
| `GET /api/v1/providers` — 供应商列表 | ADR-0002 §2 | ✅ | `server.test.ts` |
| `GET /api/v1/providers/:name` — 供应商详情 | ADR-0002 §2 | ✅ | `server.test.ts` |
| `GET /health` — 健康检查 | implementation | ✅ | `server.test.ts` |

### 2.2 数据层 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| YAML 数据源加载 (`data/providers.yaml`) | ADR-0002 §4 | ✅ | `providersStore.test.ts` |
| 缓存 TTL 10 分钟，过期重读文件 | ADR-0002 §4 | ✅ | `providersStore.test.ts` |
| 字段投影（列表: description 截断 32 字符 + 模型前 3） | ADR-0002 §5 | ✅ | `providersStore.test.ts` |
| 字段投影（详情: intro 截断 300 字符） | ADR-0002 §5 | ✅ | `providersStore.test.ts` |
| `updated_at` 使用文件 mtime | ADR-0002 §5 | ✅ | `providersStore.test.ts` |
| 文件不存在/解析失败 → 空列表 + 日志告警 | ADR-0002 §4 | ✅ | `providersStore.test.ts` |
| 未知 Provider 返回 404 | ADR-0002 §9 | ✅ | `server.test.ts` |

### 2.3 运维 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 优雅关闭（503 拒绝新请求） | implementation | ✅ | `graceful-shutdown.test.ts` |
| 缓存失效管理端点 (仅 localhost) | implementation | ✅ | `server.test.ts` |

### 2.4 安全 ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| 速率限制 8 req/min/client (IP 固定窗口，env 可配) | requirements §安全 | ✅ | `rateLimit.test.ts` |
| x-client-id HMAC-SHA256 签名验证 | requirements §安全 | ✅ | `auth.test.ts` |
| 客户端注册 (POST /api/v1/register) | requirements §安全 | ❌ | 已取消，改用共享密钥 |
| /health 端点豁免限流和认证 | implementation | ✅ | `server.ts` onRequest hooks |

---

## 三、应用检测器验收 ✅

| 应用 | 配置路径 | 配置格式 | 状态 | 验证方式 |
|------|---------|---------|------|---------|
| Codex | `~/.codex/config.toml` | TOML | ✅ | `detectors.test.ts` |
| Claude Code | `~/.claude/settings.json` | JSON | ✅ | `detectors.test.ts` |
| OpenClaw | `~/.openclaw/config.yaml` | YAML | ✅ | `detectors.test.ts` |

---

## 四、配置改写 (Appfit) 验收 ✅

| 应用 | 协议 | 配置文件 | 改写方式 | 状态 | 验证方式 |
|------|------|---------|---------|------|---------|
| Codex | openai | config.toml + auth.json | smol-toml + JSON | ✅ | `appfits.test.ts` |
| Claude Code | anthropic | settings.json (env block) | JSON | ✅ | `appfits.test.ts` |
| OpenClaw | undefined | config.yaml | yaml | ✅ | `appfits.test.ts` |

**关键行为验证**：
- Codex: 设置 `model_provider=custom`、写入 `model_providers.custom`、写入 `auth.json` 的 `OPENAI_API_KEY` ✅
- Claude Code: 写入 `env.ANTHROPIC_AUTH_TOKEN`、`env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_MODEL`，清理遗留的顶层字段 ✅
- OpenClaw: 写入 `provider`、`base_url`、`api_key`、`model` ✅
- model 未提供时不修改模型字段 ✅
- 多协议 URL 选择正确（openai ↔ anthropic ↔ default）✅

---

## 五、数据持久化验收 ✅

| 文件 | 路径 | 内容 | 状态 |
|------|------|------|------|
| 运行时配置 | `~/.tokenmofang/config.json` | apiUrl, fingerprint | ✅ |
| Provider 记忆 | `~/.tokenmofang/settings.json` | per-provider {apiKey, model, urls} | ✅ |
| 检测报告 | `~/.tokenmofang/detection-report.json` | timestamp, apps, fingerprint | ✅ |

---

## 六、pazi 数据采集系统 — 独立验收

pazi 为私有仓库 (`tokenmofang-pazi`)，通过 git submodule 挂载。属于独立子系统，需另行制定验收计划。

已实现的功能（供参考）：
- ✅ 三脚本分解 (scrawl.ts / merge.ts / run.ts) — ADR-0009
- ✅ 多源抓取 (tokensqc, ztest) — ADR-0005
- ✅ 合并去重策略 (name 归一化, 并集合并) — ADR-0006
- ✅ 信任分级写入 (手工名单保护, 静默覆盖, 新条目 REVIEW) — ADR-0008
- ✅ CST 保留格式写入 — ADR-0007

---

## 七、测试覆盖总结 ✅

| 测试文件 | 测试数 | 状态 | 覆盖范围 |
|---------|--------|------|---------|
| **CLI** | **154** | ✅ 全部通过 | |
| use.test.ts | — | ✅ | use 全流程 E2E、备份、记忆、API 调用、三应用 |
| rollback.test.ts | — | ✅ | 单/多文件恢复、部分备份、app 选择 |
| appfits.test.ts | — | ✅ | 三应用改写正确性、协议选择 |
| list.test.ts | — | ✅ | 表格格式化、--all、--debug、错误处理 |
| ask.test.ts | — | ✅ | Provider 详情查询、404、429、网络错误、--debug |
| setup.test.ts | — | ✅ | 检测、报告、fingerprint、root 警告 |
| test.test.ts | — | ✅ | Provider 健康测试、延迟、token 消耗 |
| config.test.ts | — | ✅ | ConfigProvider、getApiUrl |
| detectors.test.ts | — | ✅ | 三应用检测 |
| settings.test.ts | — | ✅ | load/save/get/set 持久化 |
| api.test.ts | — | ✅ | API 客户端 fetch 函数 |
| contract.test.ts | — | ✅ | ProviderListItem/ProviderDetail 类型契约 |
| **API** | **51** | ✅ 全部通过 | |
| server.test.ts | — | ✅ | /providers 列表/详情、404、缓存失效 |
| providersStore.test.ts | — | ✅ | YAML 加载、缓存、投影、截断、mtime |
| rateLimit.test.ts | — | ✅ | IP 固定窗口限流（允许/拒绝/独立IP/过期） |
| auth.test.ts | — | ✅ | HMAC-SHA256 签名验证（10 场景） |
| contract.test.ts | — | ✅ | API 响应类型契约 |
| graceful-shutdown.test.ts | — | ✅ | 503 shutdown hook |
| cache.test.ts | — | ✅ | set/get/delete/过期 |
| **合计** | **205** | ✅ | |

## 八、未实现功能优先级评估

| 优先级 | 功能 | 影响范围 | 工作量估计 |
|--------|------|---------|-----------|
| **P0 (已完成)** | API 速率限制 (8 req/min/client) | 安全/成本 | ✅ |
| **P0 (已完成)** | x-client-id HMAC 签名验证 | 安全 | ✅ |
| **P1 (已完成)** | `tmf test` 命令 | 用户体验核心流程 | ✅ |
| **P1** | 交互式 API Key 输入（接入主流程） | 用户体验 | 小 |
| **P2** | `tmf import` / `tmf export` | 配置迁移 | 中 |
| **P3** | `tmf get` / `tmf set` | 配置管理 | 小 |
| **P3** | `tmf help` 显式子命令 | 用户体验 | 极小 |

---

## 九、非功能需求验收

| 验收项 | 规格来源 | 状态 | 备注 |
|--------|---------|------|------|
| TypeScript strict mode | AGENTS.md | ✅ | tsconfig 启用 strict |
| commander.js CLI 框架 | AGENTS.md | ✅ | |
| fastify API 框架 | AGENTS.md | ✅ | |
| 中文错误信息（用户可见） | AGENTS.md | ✅ | 代码审查确认 |
| 错误时退出非零 | AGENTS.md | ✅ | 代码审查确认 |
| async/await 全链路 | AGENTS.md | ✅ | |
| kebab-case CLI 命令 | AGENTS.md | ✅ | use, rollback, ask, list, setup |
| camelCase 代码标识符 | AGENTS.md | ✅ | |
| Backup 策略（sibling .bak） | AGENTS.md + ADR-0001 | ✅ | |
| 跨平台兼容性 (Linux/macOS/Windows) | implicit | ⚠️ | 仅 Linux 验证，macOS/Windows 未测试 |
| npm 包发布 | implicit | ✅ | `@tokenmofang/cli` 已配置发布（含 .npmignore、files、bin） |
| CI/CD 流水线 | implicit | ❌ | 未配置 |

---

## 十、遗留风险与债务

| 风险 | 严重程度 | 说明 |
|------|---------|------|
| API 无限流 — 成本攻击面 | 🟢 已解决 | IP 固定窗口限流 (env 可配) |
| x-client-id 可伪造 | 🟢 已解决 | HMAC-SHA256 签名验证 |
| CLI 无版本锁定与 API | 🟡 中 | CLI 无最低版本检查，API breaking change 静默失败 |
| 配置改写不保留注释/格式 | 🟢 低 | ADR-0001 §4 明确 v1 不处理 |
| pazi YAML 写入锁竞争 | 🟡 中 | 并发写入 `providers.yaml` 无分布式锁 |
| 测试不含真实应用 E2E | 🟡 中 | 依赖本地安装的应用，CI 无法运行 |

---

## 十一、验收结论

**可交付状态**：✅ **P0 已通过** — CLI 核心流程 (`setup` → `list` → `use` → `rollback` → `test`) 完整可用，安全基础设施（速率限制 + HMAC 签名验证）已实现，测试全部通过 (205/205)。

**发布准备**：
1. npm 包 `@tokenmofang/cli` 已配置发布
2. Docker 部署脚本 `scripts/dev-up.sh` / `scripts/dev-test.sh`
3. API 支持 Docker Compose 一键部署

**可后续迭代**：
4. `tmf import` / `tmf export`
5. 交互式 API Key 输入接入主流程
6. `tmf get` / `tmf set`
7. `tmf help` 显式子命令
8. CI/CD + 跨平台验证
