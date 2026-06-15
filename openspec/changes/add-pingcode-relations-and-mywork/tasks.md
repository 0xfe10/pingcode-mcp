# Tasks: 关系/依赖 + 个人工作台

## M1 关系工具（link / unlink / list relations）

- [x] `types.ts`：新增 `RelationType` / `WorkItemRelation`。
- [x] `client.ts`：新增 `getRelationTypes` / `listWorkItemRelations` / `createWorkItemRelation` / `deleteWorkItemRelation`。
- [x] `schemas.ts`：新增 `linkWorkItemsSchema` / `unlinkWorkItemsSchema` / `listWorkItemRelationsSchema`。
- [x] `workItemService.ts`：新增 `resolveRelationType` / `linkWorkItems`（dryRun 默认 true）/ `unlinkWorkItems`（dryRun 默认 true）/ `listWorkItemRelations`。
- [x] `index.ts`：注册 `pingcode_link_work_items` / `pingcode_unlink_work_items` / `pingcode_list_work_item_relations`。
- [x] `npm run check` 通过。

## M2 个人工作台（get_my_work）

- [x] `schemas.ts`：新增 `getMyWorkSchema`。
- [x] `workItemService.ts`：新增 `getMyWork`（聚合 my bugs+requirements，按状态分组+计数，按 id 去重）。
- [x] `index.ts`：注册 `pingcode_get_my_work`。
- [x] `npm run check` 通过。

## M3 README

- [x] Tools 表新增 4 个工具。
- [x] 关系用法说明（方向、relationType 取值、dryRun、unlink 需 relationId）。
- [x] 个人工作台说明 + 2-3 个自然语言示例。

## M4 验证

- [x] `npm run check` / `npm run build` 通过。
- [x] index.ts 可见 4 个新工具；工具总数 27。
- [x] dryRun：link/unlink dryRun=true 不发写请求。
- [x] readonly：`PINGCODE_READONLY=true` 拒绝 link/unlink。
- [x] relationType 系统枚举直通 + 按名解析（stub 验证）。
- [x] get_my_work 按状态分组（stub 验证）。
- [x] 现有 23 工具向后兼容。

## M5 复盘

- [x] 输出变更清单、验证结果、残余风险。
