# ADR-0002: `ask` 命令 + API Provider 详情设计

## Status

Accepted (2026-06-19)

## Context

Issue [#6](../../issues/6) 要求实现 `tmf ask <provider>` 命令，调用 API 获取供应商详情并格式化输出。同时需要补齐 API 后端 `/providers` 和 `/providers/:name` 两个端点，与 `list` 命令共享同一份 YAML 数据源。

设计过程中涉及数据模型统一、职责拆分、CLI 与 API 的数据投影策略、以及 `use` / `list` 命令的联动变更。

## Decisions

### 1. Mock 删除

- `code/cli/src/providers/ask.ts`（硬编码 mock）删除
- 真实 API 调用通过新增 `code/cli/src/providers/api.ts` 实现
- 两个共享函数：`fetchProviderInfo(name)` 和 `fetchProviderList()`

### 2. API 响应格式

- `GET /api/v1/providers` → JSON 数组，字段投影为 list 视图
- `GET /api/v1/providers/:name` → JSON 对象，完整 Provider 详情
- CLI 负责格式化输出，API 不负责任何 Markdown 渲染

### 3. CLI 输出格式

`tmf ask packcode` 输出纯文本 + emoji：

```
🔍 packcode

  简介：深度求索 DeepSeek V4 旗舰模型 🚀
  网址：https://platform.deepseek.com
  默认模型：deepseek-v4-pro
  API 地址：https://api.deepseek.com/openai
  可用模型：deepseek-v4-pro, deepseek-v4-lite
  数据更新：2026年6月19日 16:30
```

### 4. 数据源：YAML + 热加载

- 文件：`code/api/data/providers.yaml`（列表格式，一个 provider 一条）
- 热加载策略：Cache TTL 10 分钟，过期后重读文件
- 解析库：`yaml`（和 CLI 一致，`^2.9.0`）
- 文件不存在/解析失败：返回空列表 + 日志告警，服务继续运行

### 5. 字段投影

YAML 为超集，两个 API 端点各自投影：

| 端点 | 返回字段 |
|------|----------|
| `/providers` | name, latency, price, tokensPerSecond, description（intro 首句 ≤32 字符）, tags, models（前 3）, modelCount |
| `/providers/:name` | name, intro（完整 ≤300 字符）, website, baseUrl, defaultModel, models（全量）, updated_at（文件 mtime） |

- `description` = `intro` 的首句（以 `。` `.` `．` 分隔），超过 32 字符则截断
- `updated_at` = provider 记录的 YAML 文件 mtime，运行时获取

### 6. 类型组织

CLI 侧类型统一到 `types/provider.ts`：

```ts
interface ProviderListItem {
  name: string;
  latency: number;
  price: string;
  tokensPerSecond: number | null;
  description: string;
  tags: string[];
  models: string[];
  modelCount: number;
}

interface ProviderDetail {
  name: string;
  intro: string;
  website: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  updated_at: string;
}
```

### 7. Provider 路由认证

- `/providers` 和 `/providers/:name` 暂不加 `verifyAuth` preHandler
- 直接使用 raw fingerprint 作为 x-client-id 透传
- 认证逻辑留待后续 issue 统一补上

### 8. 速率限制

- 限流逻辑由运维层（nginx/API Gateway）负责
- CLI 端处理 HTTP 429 状态码，显示友好错误：「请求过于频繁，请稍后重试」
- `list` 和 `ask` 共享同一错误处理逻辑

### 9. 错误处理

| 场景 | 用户信息 |
|------|----------|
| 网络错误 | 「请检查网络连接」 |
| 404 | 「未找到供应商: {name}」 |
| 429 | 「请求过于频繁，请稍后重试」 |
| 其他 HTTP 错误 | 「服务异常（状态码: {code}），请稍后重试」 |
| JSON 解析失败 | 「响应数据异常」 |

### 10. `ConfigProvider` 提取

从 `commands/list.ts` 提取到 `config.ts`，`list` 和 `ask` 共用。

### 11. `use` 命令适配

`useCommand` 原来导入 `providers/ask.ts` 的 `queryProvider`（mock），改为从 `providers/api.ts` 导入 `fetchProviderInfo`，新增 `getApiUrl` + `settings.clientId` 参数。

### 12. `list` 命令适配

- 模型列表展示前 3 个 + `(+N)` 剩余计数
- API client 从 `providers/api.ts` 导入（不再内联 fetch）
- 新增字段：models, modelCount

### 13. API 模块结构

```
code/api/
├── src/
│   ├── providersRoute.ts    # Fastify 路由注册（两个端点）
│   └── providersStore.ts    # YAML 加载 + Cache + 查询 + 截断
└── data/
    └── providers.yaml       # Provider 元数据
```

### 14. 测试策略

- **API Store 测试**：YAML 解析、缓存命中/过期、intro 截断、mtime、未知 provider 返回 undefined
- **API Route 测试**：`/providers` 200/空数据、`/providers/:name` 200/404、字段投影
- **CLI ask 测试**：mock fetch，覆盖成功、404、429、网络错误、debug
- **CLI list 测试**：现有测试适配新字段（models、modelCount）
- **CLI use 测试**：mock 从 `queryProvider` 改为 `fetchProviderInfo`

## Consequences

- `providers/ask.ts` 删除，mock 不再存在
- `use`、`list`、`ask` 三个命令共享 `providers/api.ts`
- API 新增 `yaml` 依赖
- `list` 输出格式变化（新增模型列）
