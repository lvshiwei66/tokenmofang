# Repository Guidelines

## Project Overview

**Token魔方 (tokenmofang)** — a tool for managing and switching third-party LLM providers across locally-installed AI applications. It works by reading and modifying each application's config file (TOML, JSON, YAML) to point at a different provider/model.

Two deployable artifacts:

- **CLI** (`tmf`) — command-line tool running on user machines
- **API** — cloud-hosted backend serving provider listings, health status, and detail queries

**Status**: pre-implementation (requirements exist; `code/` is empty).

## Architecture & Data Flow

```
User machine                          Cloud
─────────────                         ─────
tmf CLI ──list/ask──►  API ──► provider registry / cache
  │                      │
  │ setup: scans local    │ serves rate-limited (8 req/min/client)
  │   app configs         │
  │                       │
  │ use/rollback:         │
  │   reads/writes app    │
  │   config files        │
  └───────────────────────┘
```

- CLI talks to the API for discovery (`list`, `ask`); operates locally for config mutations (`use`, `rollback`, `setup`, `test`).
- `setup` detects installed AI apps (codex, claude-code, openclaw, etc.) and their config paths/types, writing a local structured report.
- `use` backs up the current config (`.bak` extension alongside the original), then rewrites it for the target provider.
- `rollback` restores from a `.bak` file.
- `import`/`export` serialize the full tool configuration to/from YAML.


```
tokenmofang/                  # 公开仓库 (CLI)
├── docs/                     # 需求文档 + agent 配置
├── code/
│   └── cli/                  # CLI 包 (commander.js + TypeScript)
└── AGENTS.md

tokenmofangapi/               # 私有仓库 (API) — 禁止开源
└── src/
    └── server.ts             # Fastify 服务端
```

## Development Commands

Not yet established. Expected toolchain:

- **Runtime**: Node.js (≥18 LTS)
- **Package manager**: npm (or pnpm — TBD)
- **Language**: TypeScript with strict mode
- **Build**: `tsc` or `tsup`/`esbuild` for each package
- **Test**: `vitest` or `node --test` (TBD)
- **Lint**: `eslint` + `prettier`
- **CLI entry**: `code/cli/src/index.ts` → `tmf` binary
- **API entry**: `tokenmofangapi/src/server.ts` → HTTP server（私有仓库）

## Code Conventions & Common Patterns

### Formatting & Naming

- TypeScript strict mode
- kebab-case for CLI commands (`tmf use`, `tmf rollback`)
- camelCase for code identifiers
- PascalCase for classes and React components (if any)

### Error Handling

- CLI: user-facing errors in Chinese; structured error codes for scripting
- `use` command: auto-retry on failure; re-run `setup` detection before retry
- `rollback`: explicit error when backup is missing

### State & Configuration

- CLI persists user settings (API keys, last-used model) locally — exact storage TBD (likely a dotfile or OS config dir)
- `setup` produces a structured detection report stored locally
- Backup strategy: every config mutation creates a sibling `.bak` file (e.g., `settings.json` → `settings.json.bak`)

### Async Patterns

- CLI commands are I/O heavy (file reads, network calls) — async/await throughout
- API responses cached aggressively for `list` and `ask` endpoints to reduce backend cost
- Rate limiting on API: 8 requests per minute per client, identified by a stable client ID

### Dependency Injection

- Not yet specified. Consider a simple service-locator or factory pattern for testability of file-system and network operations.

## Important Files (Planned)

| File                                | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `code/cli/src/index.ts`             | CLI entry point; commander.js program definition             |
| `code/cli/src/commands/setup.ts`    | App detection and local report generation                    |
| `code/cli/src/commands/list.ts`     | Query provider list from API                                 |
| `code/cli/src/commands/use.ts`      | Switch provider for an app (backup + rewrite config)         |
| `code/cli/src/commands/rollback.ts` | Restore config from backup                                   |
| `code/cli/src/commands/test.ts`     | Health-check a provider (latency, throughput, accessibility) |
| `code/cli/src/commands/ask.ts`      | Fetch provider detail docs from API                          |
| `code/cli/src/commands/import.ts`   | Import settings from YAML                                    |
| `code/cli/src/commands/export.ts`   | Export settings to YAML                                      |
| `code/cli/src/detectors/`           | Per-app config format detectors (TOML, JSON, YAML)           |
| `code/api/src/server.ts`            | Fastify server bootstrap (buildServer factory)               |
| `code/api/src/main.ts`              | Entry point: startup, graceful shutdown, 503 shutdown hook   |
| `code/api/src/auth.ts`              | HMAC-SHA256 x-client-id signing and verification             |
| `code/api/src/registerRoute.ts`     | POST /api/v1/register with schema validation                 |
| `code/api/src/healthRoute.ts`       | GET /health (no version prefix, no auth)                     |
| `code/api/src/cache.ts`             | In-memory cache with lazy-expiry TTL                         |
| `code/api/src/config.ts`            | Environment variable config with defaults and validation     |

## Runtime/Tooling Preferences

- **Runtime**: Node.js (TypeScript compiled to JS)
- **CLI framework**: [commander.js](https://github.com/tj/commander.js)
- **API framework**: [fastify](https://www.fastify.io/)
- **Config parsing**: TOML, JSON, YAML support required for app config mutation
- **API security**: 客户端注册 + x-client-id 验证（见下方「客户端注册流」）；速率限制（8 req/min/client，固定窗口）

### 客户端注册流

```
CLI (setup)                          API
─────────────                        ───
1. 生成机器指纹（幂等）
2. POST /register ────────────────►  3. 混合计算生成 x-client-id
4. 保存 x-client-id ◄──────────────  （类似公私钥签名原理）
5. 后续请求带 x-client-id ────────►  6. 每个请求验证 x-client-id 有效性
```

- 非 CLI 客户端（未注册）的请求将被拒绝
- API 禁止伪造 x-client-id：x-client-id 由 API 签发，客户端仅保存使用

## 仓库拆分

- **CLI** (`tokenmofang`) — 公开仓库，含 `code/cli/` 和共享类型
- **API** (`tokenmofangapi`) — 私有仓库，含 API 服务端代码，**禁止开源**
- 两个仓库独立开发，通过 HTTP 协议通信

## 分支策略

- `main` — 稳定分支，仅从 `dev` 合并，用于发布
- `dev` — 日常开发分支，所有功能从 `dev` 切出 feature 分支后合并回 `dev`
- 分支命名：`issue/N-简短描述`（如 `issue/1-api-skeleton`）

### Worktree 隔离（强制）

- 每一个 Issue 必须在独立的 git worktree 中开发，完成后删除 worktree
- CLI 开发路径：`../tokenmofang-issueN/`（相对于 `tokenmofang` 仓库根目录）
- API 开发路径：`../tokenmofangapi-issueN/`（相对于 `tokenmofangapi` 仓库根目录）
- Bug 修复与功能开发同等对待：在对应仓库的 `dev` 分支上创建 worktree
- 完成后执行 `git worktree remove <path>` 清理

## Testing & QA

- Unit tests for config parsers (TOML/JSON/YAML read+write round-trips)
- Integration tests for CLI commands (mock API, real temp filesystem)
- API endpoint tests (fastify `inject()` or supertest)
- `test` command itself serves as a live smoke test
- Coverage expectations: not yet defined

## Rule

- 永远使用中文对话

## Agent skills

### Issue tracker

Issues live as GitHub Issues in `lvshiwei66/tokenmofang`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default label vocabulary (`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
