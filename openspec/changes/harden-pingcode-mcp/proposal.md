# Proposal: pingcode-mcp 硬化（测试 / 健壮性 / 发布卫生）

## Why

30 个工具已 stub 验证 + 类型/构建通过，但工程成熟度有真实短板：零自动化测试（验证全靠一次性脚本，无回归网）、OAuth 缺 refresh-on-401 兜底、搜索/个人工作台静默截断、错误对象潜在泄露面、版本未随能力增长 bump。本次修复"不依赖真实 API 即可完成"的部分，把可回归性与发布卫生补齐。

真实 API 端到端冒烟（响应字段、OAuth 实链）需连真实租户，**不在本次范围**，留作上线前人工冒烟。

## What Changes

- **自动化测试**：用 Node 内置 `node:test`（零新依赖）+ tsx 新增 `npm test`，覆盖 dryRun/readonly、鉴权优先级与刷新、search 合并去重、getMyWork 分组、setup 配置脱敏、authStore 0600。
- **OAuth refresh-on-401**：请求遇 401 时，若用用户令牌则强制刷新一次并重试；client_credentials 缓存失效则清缓存重试一次（单次、防循环）。
- **截断提示**：`search_work_items` / `get_my_work` 返回增 `truncated` / 每 kind `hasMore`，不再静默丢弃超页数据。
- **错误脱敏**：`PingCodeApiError` 增 `toJSON()`，剔除/打码 `responseText` 中的 token/secret/Bearer，防未来误传。
- **发布卫生**：`package.json` version `0.1.0 → 0.2.0`；新增 `CHANGELOG.md`。

不包含：真实 API 冒烟（需租户）；LICENSE（开源 vs 专有属业务/法务决策，留给维护者）；本地 loopback 自动回调；限流/退避。

## Scope

允许修改：`src/pingcode/client.ts`、`src/pingcode/workItemService.ts`、`src/tools/schemas.ts`、`package.json`，新增 `test/**`、`CHANGELOG.md`。

非目标：不破坏现有 30 工具名称/入参；不引入第三方测试框架；不提交凭据；不改 OAuth/dryRun/readonly 既有语义（仅增健壮性与返回字段）。

## Success Criteria

- `npm run check`、`npm run build`、`npm test` 全通过。
- 测试覆盖：dryRun 不写、readonly 拒写、鉴权三级优先级、过期/401 刷新、search 合并去重+截断标记、authStore 0600、setup 脱敏。
- 401 时用户令牌自动刷新重试成功；超页查询返回 `truncated/hasMore`。
- 错误返回不含 token/secret/responseText。
- 现有 30 工具向后兼容；version=0.2.0；CHANGELOG 记录本轮。

## Risks and Mitigations

- **refresh-on-401 死循环**：→ 单次重试标志，刷新失败直接抛原错误。
- **测试夹具偏离真实响应**：→ 测试只断言"本地逻辑契约"（是否发写请求、用哪个 token、合并去重、字段脱敏），不假设真实业务数据；真实字段以上线冒烟为准（已在文档标注）。
- **截断字段为新增**：→ 纯增字段，向后兼容。
