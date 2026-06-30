#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

export TMF_API_PORT="${TMF_API_PORT:-3000}"
export TMF_API_URL="http://localhost:${TMF_API_PORT}"

echo "============================================"
echo " Token魔方 自动化测试 (docker compose)"
echo "============================================"

# ── 1. 启动 API ──
echo "[1/3] 启动 API (Docker)..."
cd "$PROJECT_DIR"
docker compose up -d --build api 2>&1

echo -n "  等待 API 就绪..."
READY=false
for i in $(seq 1 30); do
  if curl -sf "${TMF_API_URL}/health" > /dev/null 2>&1; then
    echo " OK"
    READY=true
    break
  fi
  sleep 1
done
if [ "$READY" = false ]; then
  echo " FAIL (超时)"
  echo "  docker logs tmf-api 查看原因"
  exit 1
fi

# ── 2. 构建 CLI 镜像 ──
echo "[2/3] 构建 CLI 镜像..."
cd "$PROJECT_DIR"
docker compose build cli 2>&1

# ── 3. 运行 tmf list ──
echo "[3/3] docker compose run cli list..."
docker compose run --rm cli list

echo ""
echo "============================================"
echo " 自动测试完成"
echo " 手动测试: docker compose run --rm cli list"
echo "           docker compose run --rm cli ask openai"
echo "============================================"
