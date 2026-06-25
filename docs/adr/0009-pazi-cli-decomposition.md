# ADR-0009: pazi CLI 三脚本分解

## Status

Accepted (2026-06-25)

## Context

ADR-0005 定义了 pazi 的 Runner + Agent 双模式，但 Runner 入口设计为单体 `run.ts` 带 `--all` 参数。Issue #24 深入设计后发现两个需求冲突：

1. **全自动模式**：`run.ts` 一键执行抓取→合并，Agent 消费 stdout JSON
2. **Agent 交互模式**：失败时 Agent 需逐源重跑、手动调 merge、人类确认后 write

如果所有功能塞进 `run.ts` 通过参数控制（`--all`、`--only=ztest`、`--merge-only`），会导致参数组合爆炸和职责模糊。需要决定 CLI 入口的拆分策略。

## Decisions

### 1. 三脚本分解

| 脚本 | 路径 | 职责 |
|------|------|------|
| `scrawl.ts` | `src/commands/scrawl.ts` | 单源抓取 → raw JSON，stdout `SingleSourceOutput` |
| `merge.ts` | `src/commands/merge.ts` | 读 raw JSON → merge → merged.json，stdout `MergeOutput` |
| `run.ts` | `src/commands/run.ts` | 全自动：spawn scrawl 子进程 → merge → stdout `RunnerOutput` |

各脚本零参数或最小参数：

- `tsx src/commands/scrawl.ts <sourceId>` — 接受一个位置参数
- `tsx src/commands/merge.ts` — 零参数，扫描 `data/extracts/raw-*.json`
- `tsx src/commands/run.ts` — 零参数，从 registry 获取源列表

**拒绝的方案**：单体 `run.ts` 带 `--only`、`--merge-only`、`--all` 等 flag。参数组合互斥需额外验证，且 `--only` 模式下 stdout 输出类型与全跑不同（增加 Agent 解析负担）。

### 2. commands 目录

所有 CLI 入口脚本放入 `src/commands/`，与纯函数模块 `src/extractors/` 分离：

```
agent/pazi/src/
├── commands/
│   ├── scrawl.ts
│   ├── merge.ts
│   └── run.ts
├── extractors/
│   ├── merge.ts       # merge() 纯函数
│   ├── write.ts       # write() 函数
│   └── ...
└── types.ts
```

### 3. run.ts 通过 spawn 调用 scrawl.ts

run.ts 不直接 import 提取器，而是 `child_process.spawn` 每个 scrawl.ts 子进程。理由：

- 进程隔离：单提取器 OOM 不影响其他
- 行为一致：spawn 和手动 `tsx src/commands/scrawl.ts` 完全等价
- run.ts 收集每个子进程的 stdout `SingleSourceOutput` JSON，组装 `RunnerOutput.sources`

run.ts 通过直接 import `merge()` 纯函数执行合并（无需 spawn merge.ts）。

### 4. scrawl.ts 接受 `--headless` flag

覆盖 `PAZI_HEADLESS` 环境变量，默认 `false`。run.ts 也接受 `--headless` 并传递给子进程。

### 5. 超时策略

- scrawl.ts 子进程：600s 超时，超时被 kill，run.ts 标记为 `error`
- run.ts 自身：620s 兜底超时，防止子进程僵死

## Consequences

| 影响 | 说明 |
|------|------|
| 文件数增加 | `src/commands/` 目录下 3 个入口脚本，替代原先计划中的 1 个 |
| Agent 流程 | SKILL.md 在交互模式中逐个调 scrawl（重跑失败源）→ merge CLI → 人类确认 → write() |
| 测试 | 每个命令可独立测试；merge CLI 可脱离 registry 运行 |
| 可扩展性 | 新增数据源不改 run.ts（仅 registry）；新增 CLI 工具放入 `src/commands/` |
