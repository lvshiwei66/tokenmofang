# ── 测试验收专用镜像 ──
# 包含 tmf CLI + 模拟的 Claude Code / Codex / OpenClaw 配置
# 用于自动化验收：tmf use / rollback 命令的端到端测试

FROM node:24-alpine

# ── 安装 tmf CLI ──
WORKDIR /app
COPY code/cli/package.json code/cli/package-lock.json ./
RUN npm ci --omit=dev
COPY code/cli/dist ./dist
RUN npm install -g .

# ── 创建应用配置（模拟已安装状态） ──
# tmf 通过检测这些配置文件来判断应用是否安装
RUN mkdir -p /root/.claude /root/.codex /root/.openclaw \
    && echo '{"env": {"ANTHROPIC_AUTH_TOKEN": "","ANTHROPIC_BASE_URL": "","ANTHROPIC_MODEL": ""}}' > /root/.claude/settings.json \
    && printf '[model_providers]\n[model_providers.custom]\nname = "custom"\nbase_url = ""\napi_key = ""\nmodel = ""\n' > /root/.codex/config.toml \
    && echo '{"OPENAI_API_KEY": ""}' > /root/.codex/auth.json \
    && printf 'provider: ""\nbase_url: ""\napi_key: ""\nmodel: ""\n' > /root/.openclaw/config.yaml

ENV TMF_API_URL=http://api:3000

ENTRYPOINT ["tmf"]
