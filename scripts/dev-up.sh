#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

export TMF_API_PORT="${TMF_API_PORT:-3000}"

echo "============================================"
echo " Token魔方 开发环境启动"
echo "============================================"
echo ""

# ── 1. 启动 API + 构建 CLI ──
echo "[1/2] 启动 API + 构建 CLI (Docker)..."
cd "$PROJECT_DIR"
docker compose up -d --build api 2>&1
docker compose build cli 2>&1

# ── 2. 等待健康检查 ──
echo "[2/2] 等待 API 就绪..."
API_URL="http://localhost:${TMF_API_PORT}"
for i in $(seq 1 30); do
  if curl -sf "${API_URL}/health" > /dev/null 2>&1; then
    echo "  ✅ API 已就绪 (${API_URL})"
    break
  fi
  sleep 1
done

echo ""
echo "============================================"
echo " 开发环境已就绪"
echo "============================================"
echo ""
echo "使用方式（Docker）："
echo "  docker compose run --rm cli list"
echo "  docker compose run --rm cli list --all"
echo "  docker compose run --rm cli ask openai"
echo ""
echo "停止环境："
echo "  ./scripts/dev-down.sh"
echo "============================================"
