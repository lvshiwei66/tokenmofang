#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
# Format: "provider_name|keyword|default_model"
declare -a PROVIDERS=(
  "deepseek|deepseek|deepseek-v4-pro"
  "xcode|gpt|gpt-5.4-mini"
  "openai|gpt|gpt-5.1"
)

TIMEOUT=60
PROMPT="Reply with only your model name"
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

# --- Test functions ---

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

# --- Main ---

main() {
  local provider="" app="all" model=""

  if [ $# -lt 1 ]; then
    usage
  fi
  case "$1" in
    -h|--help) usage ;;
  esac
  provider="$1"
  shift

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

  case "$app" in
    codex|claude-code|all) ;;
    *) die "Invalid --app value: '$app' (must be codex, claude-code, or all)" ;;
  esac

  if ! lookup_provider "$provider"; then
    die "Provider '$provider' not in mapping table. Available: $(printf '%s ' "${PROVIDERS[@]}" | sed 's/|[^|]*|[^|]*//g')"
  fi
  model="${model:-$DEFAULT_MODEL}"

  local api_key
  api_key=$(get_api_key "$provider")

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

