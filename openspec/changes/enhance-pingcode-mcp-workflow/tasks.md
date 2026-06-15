# Tasks: PingCode MCP 闭环工作台

每批独立可验证，不一次性大改。`[x]` 表示完成，随实现进度勾选。

## M0 审计现状

- [x] 审计现有架构（client / service / index 分层）与 13 个工具。
- [x] 确认复用基石：`assertWritable`、`summarizeWorkItem`、dryRun 模式、name→id 解析、`resolveWorkItem`。
- [x] PM 输出用户场景、Jira 差距表、P0/P1/P2 Roadmap、评论模板。
- [x] Architect 输出分层决策、5 工具 zod schema、Service/Client 边界、runMutation、安全策略、文件级改动清单。
- [x] API 核实端点真实性：单条详情端点存在、`updated_between` 服务端支持、无 transition 校验、无版本号、webhook 不支持。

## M1 详情与搜索工具（只读，低风险先行）

- [x] `src/tools/schemas.ts`：新增 `getWorkItemSchema` / `searchWorkItemsSchema`（含共享 `projectScope` / `workItemLocator`）。
- [x] `src/pingcode/client.ts`：新增 `getWorkItem(workItemId)`。
- [x] `src/pingcode/types.ts`：`WorkItemListQuery` 增补可选 `updated_between`。
- [x] `src/pingcode/workItemService.ts`：新增 `getWorkItemDetail`、`searchWorkItems`、`resolveWorkItemStrict`，导出 `detailWorkItem`；`list` 透传 `updated_between`。
- [x] `src/index.ts`：注册 `pingcode_get_work_item`、`pingcode_search_work_items`。
- [x] `npm run check` 通过。

## M2 字段编辑与状态变更计划

- [x] `src/tools/schemas.ts`：新增 `planStatusChangeSchema` / `updateWorkItemFieldsSchema`。
- [x] `src/pingcode/workItemService.ts`：新增 `runMutation` 骨架、`planStatusChange`（只读）、`updateWorkItemFields`（dryRun 默认 true + 字段 diff + 弱幂等）。
- [x] `src/index.ts`：注册 `pingcode_plan_status_change`、`pingcode_update_work_item_fields`。
- [x] `npm run check` 通过。

## M3 triage 组合动作

- [x] `src/tools/schemas.ts`：新增 `triageWorkItemSchema`。
- [x] `src/pingcode/workItemService.ts`：新增 `triageWorkItem`（字段+状态合并一次 PATCH + 可选评论，dryRun 默认 true，expected 保护整单拒绝）。
- [x] `src/index.ts`：注册 `pingcode_triage_work_item`。
- [x] `npm run check` 通过。

## M4 README / examples / Roadmap

- [x] README Tools 表新增 5 个工具。
- [x] 新增 triage 评论模板（接单 / 处理中 / 修复待回归 / 需求进入开发）。
- [x] 新增 P1 / P2 Roadmap 段落。
- [x] 新增能力降级说明（状态流转无工作流校验、无版本号、changelog/webhook 边界）。

## M5 类型检查与构建验证

- [x] `npm run check` 通过。
- [x] `npm run build` 通过。
- [x] dryRun 验证：写工具 dryRun=true 不发写请求（代码路径核验）。
- [x] readonly 验证：`PINGCODE_READONLY=true` 时写工具拒绝（assertWritable 路径核验）。
- [x] README 工具表含全部新工具。

## M6 最终复盘

- [x] 输出已实现工具、进入 Roadmap 的需求、验证结果、风险与降级方案。
- [x] 确认现有 13 个工具向后兼容。
