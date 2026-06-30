#!/usr/bin/env bash
# ── 卸载测试验收环境 ──
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 卸载测试验收环境 ==="
docker compose -f docker-compose.test.yml down -v
echo ""
echo "已清理：容器 + 网络 + 持久化配置"
