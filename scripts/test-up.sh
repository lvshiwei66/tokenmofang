#!/usr/bin/env bash
# ── 加载测试验收环境 ──
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 加载测试验收环境 ==="
docker compose -f docker-compose.test.yml up -d --build api
echo ""
echo "环境就绪，执行命令："
echo "  docker compose -f docker-compose.test.yml run --rm test list"
echo "  docker compose -f docker-compose.test.yml run --rm test use openai -k sk-xxx -m gpt-5.1"
echo "  docker compose -f docker-compose.test.yml run --rm test rollback"
echo ""
echo "卸载环境："
echo "  ./scripts/test-down.sh"
