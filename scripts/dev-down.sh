#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo " Token魔方 开发环境停止"
echo "============================================"

cd "$PROJECT_DIR"
docker compose down

echo ""
echo "✅ 所有服务已停止"
