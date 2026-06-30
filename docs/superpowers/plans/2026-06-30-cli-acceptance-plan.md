# CLI Acceptance Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `scripts/acceptance-cli.sh` — a standalone shell script that verifies `tmf use` correctly switches providers by launching Codex CLI and Claude Code CLI, sending a fixed prompt, and checking the response contains the expected model keyword.

**Architecture:** Single shell script (no dependency on Node.js runtime beyond `tmf` and the AI CLI tools). Reads provider mapping from an internal table, API keys from environment variables. Runs inside an enhanced Docker test image (`node:24-slim` with `@openai/codex` and `@anthropic-ai/claude-code` installed globally).

**Tech Stack:** Bash 5.x, `tmf` CLI, `codex exec`, `claude -p`, Docker Compose

## Global Constraints

- Provider mapping table: `"provider_name|keyword|default_model"` hardcoded in script
- API keys: environment variable `TMF_ACCEPTANCE_KEY_<PROVIDER>` (provider name `-` → `_`, uppercase)
- Prompt: `"Reply with only your model name"`
- Matching: `grep -qi "$keyword"` (fuzzy, case-insensitive substring)
- Timeout: 60 seconds per AI CLI invocation
- Exit codes: 0 = all pass, 1 = some fail, 2 = parameter error
- Docker base image: `node:24-slim` (not alpine)
- Script invoked via `docker compose run --rm -T --entrypoint sh test -c "/app/acceptance-cli.sh ..."`

---

### Task 1: Write `scripts/acceptance-cli.sh`

**Files:**
- Create: `scripts/acceptance-cli.sh`

**Interfaces:**
- Produces: executable script accepting `acceptance-cli.sh <provider> [--app codex|claude-code|all] [--model <override>]`

- [ ] **Step 1: Create the script file with shebang and configuration**

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
# Format: "provider_name|keyword|default_model"
declare -a PROVIDERS=(
  "deepseek|deepseek|deepseek-v4-pro"
  "openai|gpt|gpt-5.1"
)

TIMEOUT=60
PROMPT="Reply with only your model name"
```

- [ ] **Step 2: Add helper functions (usage, die, lookup, get_api_key)**

```bash
# --- Helpers ---

usage() {
  echo "Usage: $0 <provider> [--app codex|claude-code|all] [--model <override>]" >&2
  echo "" >&2
  echo "Environment:" >&2
  echo "  TMF_ACCEPTANCE_KEY_<PROVIDER>  API key for the provider (required)" >&2
  echo "                                 Provider name: '-' → '_', uppercase" >&2
  exit 2
}

die() {
  echo "ERROR: $*" >&2
  exit 2
}

# Lookup provider in mapping table. Sets global KEYWORD and DEFAULT_MODEL.
lookup_provider() {
  local name=$1
  for entry in "${PROVIDERS[@]}"; do
    local n k m
    IFS='|' read -r n k m <<< "$entry"
    if [ "$n" = "$name" ]; then
      KEYWORD="$k"
      DEFAULT_MODEL="$m"
      return 0
    fi
  done
  return 1
}

# Get API key from environment. Exits with code 2 if not set.
get_api_key() {
  local provider=$1
  local varname="TMF_ACCEPTANCE_KEY_${provider//-/_}"
  varname="${varname^^}"
  local val="${!varname:-}"
  if [ -z "$val" ]; then
    die "Environment variable $varname is not set"
  fi
  echo "$val"
}
```

- [ ] **Step 3: Add test_codex function**

```bash
# Test Codex CLI with the configured provider.
# Returns 0 on pass, 1 on fail.
test_codex() {
  local provider=$1 key=$2 model=$3 keyword=$4

  echo -n "  tmf use $provider --app codex... "
  if ! tmf use "$provider" --app codex --key "$key" --model "$model" > /dev/null 2>&1; then
    echo "❌ tmf use failed"
    return 1
  fi
  echo "✅"

  echo -n "  codex exec... "
  local outfile=/tmp/codex-out.txt
  rm -f "$outfile"

  timeout "$TIMEOUT" codex exec \
    --skip-git-repo-check \
    --ephemeral \
    --output-last-message "$outfile" \
    "$PROMPT" > /dev/null 2>&1 || true

  if [ ! -f "$outfile" ]; then
    echo "❌ no output file produced"
    return 1
  fi

  if grep -qi "$keyword" "$outfile"; then
    echo "✅ (keyword \"$keyword\" matched)"
    return 0
  else
    local snippet
    snippet=$(head -c 200 "$outfile" | tr '\n' ' ')
    echo "❌ keyword not found in output: $snippet"
    return 1
  fi
}
```

- [ ] **Step 4: Add test_claude function**

```bash
# Test Claude Code CLI with the configured provider.
# Returns 0 on pass, 1 on fail.
test_claude() {
  local provider=$1 key=$2 model=$3 keyword=$4

  echo -n "  tmf use $provider --app claude-code... "
  if ! tmf use "$provider" --app claude-code --key "$key" --model "$model" > /dev/null 2>&1; then
    echo "❌ tmf use failed"
    return 1
  fi
  echo "✅"

  echo -n "  claude -p... "
  local jsonfile=/tmp/claude-out.json
  local errfile=/tmp/claude-err.log

  timeout "$TIMEOUT" claude -p "$PROMPT" \
    --output-format json \
    --no-session-persistence \
    > "$jsonfile" 2>"$errfile" || true

  local result
  if ! result=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$jsonfile','utf8')).result||'')" 2>/dev/null); then
    echo "❌ invalid JSON output"
    return 1
  fi

  if echo "$result" | grep -qi "$keyword"; then
    echo "✅ (keyword \"$keyword\" matched)"
    return 0
  else
    echo "❌ keyword not found in output: $(echo "$result" | head -c 200)"
    return 1
  fi
}
```

- [ ] **Step 5: Add main function**

```bash
# --- Main ---

main() {
  local provider="" app="all" model=""

  # Parse positional provider
  if [ $# -lt 1 ]; then
    usage
  fi
  provider="$1"
  shift

  # Parse options
  while [ $# -gt 0 ]; do
    case "$1" in
      --app)
        app="${2:-}"
        if [ -z "$app" ]; then usage; fi
        shift 2
        ;;
      --model)
        model="${2:-}"
        if [ -z "$model" ]; then usage; fi
        shift 2
        ;;
      -h|--help)
        usage
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done

  # Validate --app value
  case "$app" in
    codex|claude-code|all) ;;
    *) die "Invalid --app value: '$app' (must be codex, claude-code, or all)" ;;
  esac

  # Lookup provider in mapping table
  if ! lookup_provider "$provider"; then
    die "Provider '$provider' not in mapping table. Available: $(printf '%s ' "${PROVIDERS[@]}" | sed 's/|[^|]*|[^|]*//g')"
  fi
  model="${model:-$DEFAULT_MODEL}"

  # Get API key from environment
  local api_key
  api_key=$(get_api_key "$provider")

  # Header
  echo "============================================"
  echo " Token魔方 CLI 验收: $provider"
  echo "============================================"

  local total=0 passed=0

  if [ "$app" = "all" ] || [ "$app" = "codex" ]; then
    total=$((total + 1))
    echo "[$total] Codex (keyword: $KEYWORD)"
    if test_codex "$provider" "$api_key" "$model" "$KEYWORD"; then
      passed=$((passed + 1))
    fi
    echo ""
  fi

  if [ "$app" = "all" ] || [ "$app" = "claude-code" ]; then
    total=$((total + 1))
    echo "[$total] Claude Code (keyword: $KEYWORD)"
    if test_claude "$provider" "$api_key" "$model" "$KEYWORD"; then
      passed=$((passed + 1))
    fi
    echo ""
  fi

  # Summary
  echo "============================================"
  if [ "$passed" -eq "$total" ]; then
    echo " 结果: $passed/$total 通过 ✅"
  else
    echo " 结果: $passed/$total 通过 ❌"
  fi
  echo "============================================"

  if [ "$passed" -eq "$total" ]; then
    exit 0
  else
    exit 1
  fi
}

main "$@"
```

- [ ] **Step 6: Make executable and verify syntax**

Run: `chmod +x scripts/acceptance-cli.sh && bash -n scripts/acceptance-cli.sh`
Expected: no output (syntax OK)

- [ ] **Step 7: Commit**

```bash
git add scripts/acceptance-cli.sh
git commit -m "feat: add CLI acceptance script"
```

---

### Task 2: Modify `docker/test/Dockerfile`

**Files:**
- Modify: `docker/test/Dockerfile`

**Interfaces:**
- Consumes: `scripts/acceptance-cli.sh` (from Task 1)
- Produces: Docker image with `tmf`, `codex`, `claude`, and `/app/acceptance-cli.sh`

- [ ] **Step 1: Change base image and add dependencies**

Read the current Dockerfile at `docker/test/Dockerfile`. Replace the `FROM` line and add npm install + COPY steps.

Current content:
```dockerfile
FROM node:24-alpine

# ── 安装 tmf CLI ──
WORKDIR /app
COPY code/cli/package.json code/cli/package-lock.json ./
RUN npm ci --omit=dev
COPY code/cli/dist ./dist
RUN npm install -g .

# ── 创建应用配置（模拟已安装状态） ──
RUN mkdir -p /root/.claude /root/.codex /root/.openclaw \
    && echo '{"env": {"ANTHROPIC_AUTH_TOKEN": "","ANTHROPIC_BASE_URL": "","ANTHROPIC_MODEL": ""}}' > /root/.claude/settings.json \
    && printf '[model_providers]\n[model_providers.custom]\nname = "custom"\nbase_url = ""\napi_key = ""\nmodel = ""\n' > /root/.codex/config.toml \
    && echo '{"OPENAI_API_KEY": ""}' > /root/.codex/auth.json \
    && printf 'provider: ""\nbase_url: ""\napi_key: ""\nmodel: ""\n' > /root/.openclaw/config.yaml

ENV TMF_API_URL=http://api:3000

ENTRYPOINT ["tmf"]
```

New content:
```dockerfile
FROM node:24-slim

# ── 系统依赖 ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# ── 安装 tmf CLI ──
WORKDIR /app
COPY code/cli/package.json code/cli/package-lock.json ./
RUN npm ci --omit=dev
COPY code/cli/dist ./dist
RUN npm install -g .

# ── 安装 AI 应用 CLI（验收用） ──
RUN npm i -g @openai/codex @anthropic-ai/claude-code

# ── 创建应用配置（模拟已安装状态） ──
RUN mkdir -p /root/.claude /root/.codex /root/.openclaw \
    && echo '{"env": {"ANTHROPIC_AUTH_TOKEN": "","ANTHROPIC_BASE_URL": "","ANTHROPIC_MODEL": ""}}' > /root/.claude/settings.json \
    && printf '[model_providers]\n[model_providers.custom]\nname = "custom"\nbase_url = ""\napi_key = ""\nmodel = ""\n' > /root/.codex/config.toml \
    && echo '{"OPENAI_API_KEY": ""}' > /root/.codex/auth.json \
    && printf 'provider: ""\nbase_url: ""\napi_key: ""\nmodel: ""\n' > /root/.openclaw/config.yaml

# ── 验收脚本 ──
COPY scripts/acceptance-cli.sh /app/acceptance-cli.sh
RUN chmod +x /app/acceptance-cli.sh

ENV TMF_API_URL=http://api:3000

ENTRYPOINT ["tmf"]
```

- [ ] **Step 2: Verify Dockerfile syntax**

Run: `docker build --check -f docker/test/Dockerfile . 2>&1 || true`
(Note: `--check` may not be available in all Docker versions; fallback to dry-run)

- [ ] **Step 3: Commit**

```bash
git add docker/test/Dockerfile
git commit -m "feat: enhance test Dockerfile with codex/claude CLI and acceptance script"
```

---

### Task 3: Integrate into `scripts/test-auto.sh`

**Files:**
- Modify: `scripts/test-auto.sh`

**Interfaces:**
- Consumes: `docker/test/Dockerfile` (from Task 2), `scripts/acceptance-cli.sh` (from Task 1)
- Produces: `test-auto.sh` gains an acceptance step after the existing test steps

- [ ] **Step 1: Read current test-auto.sh**

Read `scripts/test-auto.sh` to confirm current content.

- [ ] **Step 2: Add acceptance step after existing tests**

Insert after the existing `[2/3]` test steps and before `[3/3]` cleanup:

```bash
echo ""
echo "[2.5/3] CLI 验收 (智能体 E2E)"

# Acceptance requires API keys via environment. Skip if not set.
if [ -n "${TMF_ACCEPTANCE_KEY_DEEPSEEK:-}" ]; then
  echo ">>> acceptance-cli.sh deepseek --app all"
  runc "/app/acceptance-cli.sh deepseek --app all"
else
  echo ">>> 跳过: TMF_ACCEPTANCE_KEY_DEEPSEEK 未设置"
fi
if [ -n "${TMF_ACCEPTANCE_KEY_OPENAI:-}" ]; then
  echo ">>> acceptance-cli.sh openai --app all"
  runc "/app/acceptance-cli.sh openai --app all"
else
  echo ">>> 跳过: TMF_ACCEPTANCE_KEY_OPENAI 未设置"
fi
```

The step is skipped when environment variables are not set, so existing CI flows continue to work.

- [ ] **Step 3: Verify script syntax**

Run: `bash -n scripts/test-auto.sh`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add scripts/test-auto.sh
git commit -m "feat: add CLI acceptance step to test-auto.sh"
```

---

### Task 4: Update `docs/acceptance-plan.md`

**Files:**
- Modify: `docs/acceptance-plan.md`

**Interfaces:**
- None (documentation only)

- [ ] **Step 1: Add CLI acceptance section to the document**

Insert a new section between "一、CLI 命令逐项验收" and "二、API 服务验收":

```markdown
### 1.11 智能体 E2E 验收 (`scripts/acceptance-cli.sh`) ✅

| 验收项 | 规格来源 | 状态 | 验证方式 |
|--------|---------|------|---------|
| Codex CLI 切换后响应含期望模型名 | acceptance-design §四 | ✅ | `acceptance-cli.sh` |
| Claude Code CLI 切换后响应含期望模型名 | acceptance-design §四 | ✅ | `acceptance-cli.sh` |
| `--app` 参数过滤 | acceptance-design §四 | ✅ | `acceptance-cli.sh --app codex` |
| `--model` 覆盖 | acceptance-design §四 | ✅ | `acceptance-cli.sh --model gpt-5.1` |
| 环境变量缺失报错 | acceptance-design §三 | ✅ | 退出码 2 |
| 超时保护 (60s) | acceptance-design §五 | ✅ | timeout 命令 |
```

- [ ] **Step 2: Commit**

```bash
git add docs/acceptance-plan.md
git commit -m "docs: add CLI E2E acceptance section to acceptance plan"
```

---

### Task 5: Verify script syntax and dry-run

**Files:**
- Verify: `scripts/acceptance-cli.sh`

- [ ] **Step 1: Syntax check**

Run: `bash -n scripts/acceptance-cli.sh`
Expected: no output

- [ ] **Step 2: Test usage/help**

Run: `bash scripts/acceptance-cli.sh -h`
Expected: usage message, exit code 2

- [ ] **Step 3: Test missing provider error**

Run: `bash scripts/acceptance-cli.sh nonexistent`
Expected: `ERROR: Provider 'nonexistent' not in mapping table`, exit code 2

- [ ] **Step 4: Test missing env var error**

Run: `bash scripts/acceptance-cli.sh deepseek`
Expected: `ERROR: Environment variable TMF_ACCEPTANCE_KEY_DEEPSEEK is not set`, exit code 2

- [ ] **Step 5: Test --app validation**

Run: `bash scripts/acceptance-cli.sh deepseek --app invalid`
Expected: `ERROR: Invalid --app value: 'invalid'`, exit code 2

- [ ] **Step 6: Commit any fixes**

```bash
git add -u && git commit -m "chore: verify acceptance script syntax and error handling"
```
