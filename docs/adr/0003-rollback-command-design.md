# ADR-0003: `rollback` 命令设计

## Status

Accepted (2026-06-20)

## Context

Issue [#9](../../issues/9) 要求实现 `tmf rollback --app <app>` 命令，将指定应用的配置恢复到备份版本。备份在 `use` 命令执行时创建（sibling `.bak`），`rollback` 是 `use` 的逆操作。

设计过程中涉及多文件备份恢复策略、备份文件生命周期、与 Provider 记忆的关系、`--from` 参数取舍等交叉问题。

## Decisions

### 1. 多文件恢复策略

- 遍历 Appfit 所有 `resolveConfigPaths()` 返回的路径
- 对每个 `configPath`，检查 `configPath + ".bak"` 是否存在
- 存在则恢复，恢复成功后删除 `.bak`
- 部分 `.bak` 缺失则警告，继续处理剩余的
- 所有 `.bak` 都不存在 → 报错退出：「错误：应用设置备份丢失，恢复失败」

### 2. `--from` 参数删除

- 不做 `--from` 参数
- 只支持默认 `.bak` 后缀，由 Appfit 的 `resolveConfigPaths()` 推导

### 3. 备份文件生命周期

- 恢复成功后删除 `.bak`
- 语义：rollback 结案，不留残留
- 下一次 `use` 会重新创建新的 `.bak`

### 4. `--app` 可选

- 复用 `use` 命令的 `selectApp()` 逻辑
- 单应用自动选中，多应用未指定时报错提示
- `selectApp` 提取为共享函数

### 5. Provider 记忆不动

- `rollback` 不改写 `~/.tokenmofang/settings.json`
- Provider 凭据和回滚解耦，下一次 `use` 可直接复用

### 6. 错误处理

- 部分文件恢复失败 → 立即停止，退出非零
- App 未安装 → 调用 `detectAllApps()`，提示用户未能检测到应用
- 不自动重试

### 7. CLI 接口

```
tmf rollback --app <app>
```

- `--app`：可选；单应用自动选择，多应用未指定时报错

### 8. 输出信息

- 恢复成功：「✅ 已将 {app.name} 配置恢复至备份版本。请重启应用以生效。」
- 备份全部丢失：「错误：应用设置备份丢失，恢复失败」
- 部分缺失：对缺失的 `.bak` 输出警告

### 9. 实现要点

- `selectApp()` 导出供 `rollback` 复用
- 恢复用 `copyFile(bakPath, configPath)`，删除用 `unlink(bakPath)`
- 流程：detectAllApps → selectApp → getAppfit → resolveConfigPaths → 遍历恢复

## Consequences

- `commands/use.ts` 中 `selectApp` 导出
- 新增 `commands/rollback.ts`
- 无需修改 Appfit 接口
- 无需修改 `settings.ts`
