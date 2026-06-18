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

## Key Directories

```
tokenmofang/
├── docs/                  # Requirements and design docs
│   └── requirements-raw.md
├── code/                  # Source code (empty — not yet implemented)
│   ├── cli/               # CLI package (planned: node + commander.js + TypeScript)
│   └── api/               # API package (planned: node + fastify + TypeScript)
└── AGENTS.md
```

## Development Commands

Not yet established. Expected toolchain:

- **Runtime**: Node.js (≥18 LTS)
- **Package manager**: npm (or pnpm — TBD)
- **Language**: TypeScript with strict mode
- **Build**: `tsc` or `tsup`/`esbuild` for each package
- **Test**: `vitest` or `node --test` (TBD)
- **Lint**: `eslint` + `prettier`
- **CLI entry**: `packages/cli/src/index.ts` → `tmf` binary
- **API entry**: `packages/api/src/server.ts` → HTTP server

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
| `code/api/src/server.ts`            | Fastify server bootstrap                                     |
| `code/api/src/routes/`              | API route handlers (list, ask, etc.)                         |
| `code/api/src/cache.ts`             | Caching layer for provider data                              |

## Runtime/Tooling Preferences

- **Runtime**: Node.js (TypeScript compiled to JS)
- **CLI framework**: [commander.js](https://github.com/tj/commander.js)
- **API framework**: [fastify](https://www.fastify.io/)
- **Config parsing**: TOML, JSON, YAML support required for app config mutation
- **API security**: no authentication; rate limiting (8 req/min/client); client identity via idempotent fingerprint generated at `setup` time

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
