# E2E Test Report — `tmf test` (PR #41)

**Date:** 2026-06-27 10:28:38
**Status:** PASSING ✅

## Summary
- Total: 17 | Passed: 17 | Failed: 0

## All Results

- ✅ **成功流式响应 (Happy path)** (exit: 0)
- ✅ **认证失败: 401** (exit: 5)
- ✅ **服务异常: 503** (exit: 10)
- ✅ **权限不足: 403** (exit: 7)
- ✅ **端点不存在: 404** (exit: 8)
- ✅ **请求频繁: 429** (exit: 9)
- ✅ **请求无效: 400 (模型名错误)** (exit: 6)
- ✅ **超时/无法访问 (timeout)** (exit: 4)
- ✅ **详细输出 (--verbose)** (exit: 0)
- ✅ **自定义提示词 (--prompt)** (exit: 0)
- ✅ **--key 参数优先于 settings.json** (exit: 0)
- ✅ **--model 参数优先于 settings.json** (exit: 0)
- ✅ **缺失 API Key 错误** (exit: 3)
- ✅ **缺失 baseUrl 错误** (exit: 2)
- ✅ **空提示词错误 (--prompt '')** (exit: 13)
- ✅ **响应无 usage 字段 (NO_USAGE 错误)** (exit: 11)
- ✅ **空流响应 (accessible=false)** (exit: 4)

## Artifacts

- Report: /home/lvshiwei/.omp/wt/41-2861664/code/cli/tests/e2e/artifacts/e2e-report.md
