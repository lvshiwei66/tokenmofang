# CLI 验收设计

> 日期：2026-06-30
> 状态：已批准
> 范围：仅 Codex CLI + Claude Code CLI 两个智能体的配置生效验收

## 一、目标

验证 `tmf use` 切换供应商后，AI 应用（Codex CLI、Claude Code CLI）能正确使用新配置与 API 通信，返回的模型名与期望一致。

## 二、验收方式

独立 Shell 脚本 `scripts/acceptance-cli.sh`，通过 Docker Compose 测试环境运行。

调用方式：
```bash
docker compose -f docker-compose.test.yml run --rm -T --entrypoint sh test \
  -c "/app/acceptance-cli.sh <provider> [--app codex|claude-code|all] [--model <override>]"
```

## 三、映射表

脚本内置 provider → 验收参数映射：

| 字段 | 说明 |
|------|------|
| `provider_name` | Provider 标识名 |
| `keyword` | 模型名模糊匹配关键字（智能体输出中含此字符串即通过） |
| `default_model` | `tmf use` 的 `--model` 默认值 |

示例：
```bash
declare -a PROVIDERS=(
  "deepseek|deepseek|deepseek-v4-pro"
  "openai|gpt|gpt-5.1"
)
```

**api_key 从环境变量读取**，不在脚本中硬编码。命名规则：provider 名中 `-` → `_`，转大写，前缀 `TMF_ACCEPTANCE_KEY_`。

- `deepseek` → `TMF_ACCEPTANCE_KEY_DEEPSEEK`
- `openai` → `TMF_ACCEPTANCE_KEY_OPENAI`

环境变量未设置时脚本退出码 2。

## 四、验收流程

```
acceptance-cli.sh <provider> [--app codex|claude-code|all] [--model <override>]

1. 查映射表 → keyword, default_model
2. model = --model 参数 或 default_model
3. api_key = 环境变量（未设置退出码 2）
4. 如果 --app = codex 或 all:
   a. tmf use <provider> --app codex --key $key --model $model
   b. timeout 60 codex exec --skip-git-repo-check --ephemeral \
        --output-last-message /tmp/codex-out.txt \
        "Reply with only your model name"
   c. [ -f /tmp/codex-out.txt ] && grep -qi "$keyword" /tmp/codex-out.txt → PASS/FAIL
      (文件不存在 → FAIL: "no output file produced")
5. 如果 --app = claude-code 或 all:
   a. tmf use <provider> --app claude-code --key $key --model $model
   b. timeout 60 claude -p "Reply with only your model name" \
        --output-format json --no-session-persistence \
        > /tmp/claude-out.json 2>/tmp/claude-err.log
   c. node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/claude-out.json','utf8')).result||'')" \
        | grep -qi "$keyword" → PASS/FAIL
      (JSON 解析失败 → FAIL: "invalid JSON output")
6. 汇总输出
```

### 智能体非交互调用方式

| 智能体 | 命令 | 关键参数 |
|--------|------|---------|
| Codex CLI | `codex exec` | `--skip-git-repo-check --ephemeral --output-last-message <file>` |
| Claude Code CLI | `claude -p` | `--output-format json --no-session-persistence` |

### 提示词

统一使用：`"Reply with only your model name"`

## 五、判定逻辑

| 场景 | 判定 | 输出 |
|------|------|------|
| `codex exec` 未产出输出文件 | FAIL | `no output file produced` |
| Claude 输出非合法 JSON | FAIL | `invalid JSON output` |
**退出码**：

| 码 | 含义 |
|----|------|
| 0 | 全部通过 |
| 1 | 部分/全部失败 |
| 2 | 参数错误（provider 不在映射表、环境变量缺失） |

## 六、输出格式

```
============================================
 Token魔方 CLI 验收: deepseek
============================================
[1/2] Codex (keyword: deepseek)
  tmf use deepseek --app codex... ✅
  codex exec... ✅ (keyword "deepseek" matched)
[2/2] Claude Code (keyword: deepseek)
  tmf use deepseek --app claude-code... ✅
  claude -p... ✅ (keyword "deepseek" matched)
============================================
 结果: 2/2 通过 ✅
============================================
```

失败示例：
```
[1/2] Codex (keyword: deepseek)
  tmf use deepseek --app codex... ✅
  codex exec... ❌ keyword not found in output: "I am an AI assistant..."
```

## 七、Docker 集成

### 镜像变更

`docker/test/Dockerfile` 修改：
- Base image: `node:24-alpine` → `node:24-slim`（避免 Alpine 编译依赖问题）
- 新增：`npm i -g @openai/codex @anthropic-ai/claude-code`
- 新增：`COPY scripts/acceptance-cli.sh /app/acceptance-cli.sh`

### 调用方式

不改 `docker-compose.test.yml`，通过 `runc` 模式调用（与现有 `test-auto.sh` 一致）：

```bash
runc "/app/acceptance-cli.sh deepseek --app all"
```

## 八、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/acceptance-cli.sh` | 新增 | 验收脚本（~150 行） |
| `docker/test/Dockerfile` | 修改 | base image + npm install + COPY 脚本 |
| `scripts/test-auto.sh` | 修改 | 增加验收步骤调用 |
| `docs/acceptance-plan.md` | 修改 | 补充 CLI 验收章节 |

## 九、非目标

- 不验收 OpenClaw（仅 Codex + Claude Code）
- 不验收 `tmf ask` / `tmf list`（已有 154 项单元测试覆盖）
- 不集成到 `tmf` CLI 命令中（独立脚本）
- 不处理 API 验收和 pazi 验收（另案处理）
