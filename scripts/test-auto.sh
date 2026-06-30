#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.test.yml"
run()  { $COMPOSE run --rm -T test "$@" 2>/dev/null; }
runc() { $COMPOSE run --rm -T --entrypoint sh test -c "$*" 2>/dev/null; }

echo "============================================"
echo " Token魔方 自动化验收测试"
echo "============================================"

echo "[0/3] 清理..."
$COMPOSE down -v 2>/dev/null || true

echo "[1/3] 构建..."
$COMPOSE up -d --build api 2>&1 | tail -2
echo -n "  等待 API..."
for i in $(seq 1 30); do
  curl -sf http://localhost:3002/health > /dev/null 2>&1 && echo " OK" && break
  sleep 1
done
$COMPOSE build test 2>&1 | tail -1

echo ""
echo "[2/3] 测试清单"

echo ">>> tmf -V"
run -V

echo ">>> tmf list"
run list

echo ">>> tmf ask openai"
run ask openai

echo ">>> tmf use (all apps) + rollback"
runc "tmf use openai -k test-key-123 -m gpt-5.1 && tmf rollback --app codex"

echo ">>> tmf test openai"
run test openai --key test-key-123 || true

echo ""
echo "[3/3] 卸载..."
$COMPOSE down -v 2>&1 | tail -1

echo ""
echo "============================================"
echo " 验收完成"
echo "============================================"
