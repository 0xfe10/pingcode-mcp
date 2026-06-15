# Tasks: 核心闭环补齐（创建 / 批量 / 流转预检）

## M1 创建工作项

- [x] `schemas.ts`：新增 `createWorkItemSchema`。
- [x] `workItemService.ts`：新增 `createWorkItem`（走 runMutation，dryRun 默认 true）。
- [x] `index.ts`：注册 `pingcode_create_work_item`。
- [x] `npm run check` 通过。

## M2 原生批量更新

- [x] `types.ts`：新增 `BulkUpdatePayload`。
- [x] `client.ts`：新增 `bulkUpdateWorkItems(ids, propertyName, propertyValue)`。
- [x] `schemas.ts`：新增 `bulkUpdateWorkItemsSchema`。
- [x] `workItemService.ts`：新增 `bulkUpdateWorkItems`（planned/skipped/failed/executed + expected 保护 + dryRun 默认 true）。
- [x] `index.ts`：注册 `pingcode_bulk_update_work_items`。
- [x] `npm run check` 通过。

## M3 状态流转预检升级

- [x] `types.ts`：新增 `WorkItemStatePlan` / `WorkItemStateFlow`。
- [x] `client.ts`：新增 `getWorkItemStatePlans` / `getWorkItemStateFlows`。
- [x] `workItemService.ts`：升级 `planStatusChange`，加 `allowedTransitions` / `transitionAllowed`，解析失败回退。
- [x] `npm run check` 通过。

## M4 README

- [x] Tools 表新增 2 个工具。
- [x] 新增创建 / 批量 / 流转预检用法说明。

## M5 验证

- [x] `npm run check` / `npm run build` 通过。
- [x] dryRun 验证：create / bulk dryRun=true 不发写请求。
- [x] readonly 验证：`PINGCODE_READONLY=true` 拒绝 create / bulk。
- [x] plan_status_change 解析合法流转（stub state_flows）/ 解析失败回退。
- [x] 现有 18 工具向后兼容。

## M6 复盘

- [x] 输出已实现、验证结果、风险与降级。
