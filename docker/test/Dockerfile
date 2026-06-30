# ── 测试验收专用镜像 ──
# 包含 tmf CLI + Codex / Claude Code CLI + 模拟应用配置
# 用于自动化验收：tmf use / rollback + 智能体 E2E 验证

FROM node:24-slim

# ── 系统依赖 ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── 安装 tmf CLI ──
WORKDIR /app
COPY code/cli/package.json code/cli/package-lock.json ./
RUN npm ci --omit=dev
COPY code/cli/dist ./dist
RUN npm install -g .

# ── 安装 AI 应用 CLI（验收用） ──
RUN npm i -g @openai/codex @anthropic-ai/claude-code

# ── 创建应用配置（模拟已安装状态） ──
# tmf 通过检测这些配置文件来判断应用是否安装
RUN mkdir -p /root/.claude /root/.codex /root/.openclaw \
    && echo '{"env": {"ANTHROPIC_AUTH_TOKEN": "","ANTHROPIC_BASE_URL": "","ANTHROPIC_MODEL": ""}}' > /root/.claude/settings.json \
    && printf '[model_providers]\n[model_providers.custom]\nname = "custom"\nbase_url = ""\napi_key = ""\nmodel = ""\n' > /root/.codex/config.toml \
    && echo '{"OPENAI_API_KEY": ""}' > /root/.codex/auth.json \
    && printf 'provider: ""\nbase_url: ""\napi_key: ""\nmodel: ""\n' > /root/.openclaw/config.yaml

# ── 验收脚本 ──
COPY scripts/acceptance-cli.sh /app/acceptance-cli.sh
RUN chmod +x /app/acceptance-cli.sh

ENV TMF_API_URL=http://api:3000

ENTRYPOINT ["tmf"]
