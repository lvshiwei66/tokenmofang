#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$SCRIPT_DIR/code/api"

# ── API 监听端口（可通过环境变量覆盖） ──
TMF_API_PORT="${TMF_API_PORT:-3000}"

# ── 设置 CLI 连接 API 所需的地址 ──
# CLI 通过 TMF_API_URL 定位 API；这里自动与端口同步
export TMF_API_URL="${TMF_API_URL:-http://localhost:$TMF_API_PORT}"
export TMF_API_PORT

echo "============================================"
echo " Token魔方 API 一键启动"
echo "============================================"
echo "  API 端口 : $TMF_API_PORT"
echo "  API 地址 : $TMF_API_URL"
echo "============================================"
echo ""

cd "$API_DIR"

# ── 安装依赖（首次） ──
if [ ! -d "node_modules" ]; then
  echo "[1/2] 安装依赖..."
  npm install
else
  echo "[1/2] 依赖已安装，跳过。"
fi

# ── 编译 TypeScript ──
echo "[2/2] 编译 TypeScript..."
npx tsc

echo ""
echo "启动 API 服务..."
exec node dist/main.js
