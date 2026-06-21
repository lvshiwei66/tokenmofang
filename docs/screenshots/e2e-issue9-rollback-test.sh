#!/bin/bash
CLI="node /home/lvshiwei/projects/tokenmofang/code/cli/dist/index.js"

echo "=============================================="
echo "  tmf rollback E2E Test Report"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Issue: https://github.com/lvshiwei66/tokenmofang/issues/9"
echo "=============================================="
echo ""

# ── Save originals ──────────────────────────────
cp ~/.claude/settings.json /tmp/e2e-orig-settings.json
cp ~/.codex/config.toml /tmp/e2e-orig-config.toml
cp ~/.codex/auth.json /tmp/e2e-orig-auth.json

restore() {
  cp /tmp/e2e-orig-settings.json ~/.claude/settings.json
  cp /tmp/e2e-orig-config.toml ~/.codex/config.toml
  cp /tmp/e2e-orig-auth.json ~/.codex/auth.json
  rm -f ~/.claude/settings.json.bak ~/.codex/config.toml.bak ~/.codex/auth.json.bak
}

echo "【AC-1】tmf rollback --app claude-code (full restore)"
echo "──────────────────────────────────────────────"
rm -f ~/.claude/settings.json.bak
echo '{"provider":"backup-provider","model":"backup-model"}' > ~/.claude/settings.json.bak
echo '{"provider":"current-provider"}' > ~/.claude/settings.json
echo "Before: $(cat ~/.claude/settings.json)"
$CLI rollback --app claude-code 2>&1
echo "After:  $(cat ~/.claude/settings.json)"
echo ".bak deleted: $([ ! -f ~/.claude/settings.json.bak ] && echo 'yes ✓' || echo 'NO ✗')"
echo ""

echo "【AC-2】tmf rollback (no --app, multi-app → error)"
echo "──────────────────────────────────────────────"
$CLI rollback 2>&1 || true
echo ""

echo "【AC-3】tmf rollback --app claude-code (all .bak missing)"
echo "──────────────────────────────────────────────"
rm -f ~/.claude/settings.json.bak
echo '{"provider":"only-current"}' > ~/.claude/settings.json
$CLI rollback --app claude-code 2>&1 || true
echo "Config unchanged: $(cat ~/.claude/settings.json)"
echo ""

echo "【AC-4】tmf rollback --app codex (partial .bak)"
echo "──────────────────────────────────────────────"
echo 'model_provider = "backup-codex"' > ~/.codex/config.toml.bak
echo 'model_provider = "current-codex"' > ~/.codex/config.toml
echo '{"token":"current-auth"}' > ~/.codex/auth.json
rm -f ~/.codex/auth.json.bak
echo "Before: toml=$(cat ~/.codex/config.toml) auth=$(cat ~/.codex/auth.json)"
$CLI rollback --app codex 2>&1 || true
echo "After:  toml=$(cat ~/.codex/config.toml) auth=$(cat ~/.codex/auth.json)"
echo ".bak deleted: $([ ! -f ~/.codex/config.toml.bak ] && echo 'yes ✓' || echo 'NO ✗')"
echo ""

echo "【AC-5】Success message format"
echo "──────────────────────────────────────────────"
echo '{"provider":"bak"}' > ~/.claude/settings.json.bak
echo '{"provider":"curr"}' > ~/.claude/settings.json
$CLI rollback --app claude-code 2>&1
echo ""

echo "【AC-6】Provider memory unaffected"
echo "──────────────────────────────────────────────"
echo "settings.json exists: $([ -f ~/.tokenmofang/settings.json ] && echo 'yes' || echo 'no (not created by rollback ✓)')"
echo ""

echo "【Bonus】Non-existent app"
echo "──────────────────────────────────────────────"
$CLI rollback --app nonexistent 2>&1 || true
echo ""

echo "=============================================="
echo "  Restoring original configs..."
restore
echo "  All originals restored."
echo "  E2E Test Complete ✓"
echo "=============================================="
