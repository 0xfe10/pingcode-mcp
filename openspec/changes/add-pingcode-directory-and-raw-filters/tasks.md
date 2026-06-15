# Tasks: 目录查询 + raw 过滤

## M1 目录查询工具

- [x] `types.ts`：新增 `PingCodeTeam` / `PingCodeUser`。
- [x] `client.ts`：新增 `getCurrentTeam` / `getCurrentUser` / `listEnterpriseUsers`。
- [x] `schemas.ts`：新增 `getCurrentTeamSchema` / `getCurrentUserSchema` / `getTeamMembersSchema`。
- [x] `workItemService.ts`：新增 `getCurrentTeam` / `getCurrentUser`（应用态降级）/ `listTeamMembers`。
- [x] `index.ts`：注册 `pingcode_get_current_team` / `pingcode_get_current_user` / `pingcode_get_team_members`。
- [x] `npm run check` 通过。

## M2 search raw 过滤扩展

- [x] `types.ts`：扩展 `WorkItemListQuery`（parent/tag/sprint/board/entry/swimlane/phase/version/created_by ids + participant_id + created/start/end_between + include_deleted/archived）。
- [x] `schemas.ts`：扩展 `searchWorkItemsSchema`（raw id 数组 + participantId + *Between + include* + 保留 name 参数）。
- [x] `workItemService.ts`：扩展 `ListOptions`；`list` 合并 name 解析 id 与 raw id（去重 ≤20）+ 透传新参数；`searchWorkItems` 透传 + 结果按 id 去重。
- [x] `index.ts`：search handler 无需改逻辑（schema 扩展自动透传）。
- [x] `npm run check` 通过。

## M3 README

- [x] Tools 表新增 3 个目录工具。
- [x] 搜索说明补 raw filters（含 ≤20、participant 单值、*_between 格式、include 布尔）。
- [x] 增加 2-3 个自然语言示例。

## M4 验证

- [x] `npm run check` / `npm run build` 通过。
- [x] index.ts 可见 3 个新工具；工具总数 23。
- [x] search schema 含全部 raw filter 参数。
- [x] raw + name 合并去重（运行时 stub 验证 query 拼接）。
- [x] get_current_user 应用态降级不抛错。
- [x] `git status --ignored --short` 确认 .env/dist/node_modules/exports 未入提交。
- [x] 现有 20 工具向后兼容。

## M5 复盘

- [x] 输出变更清单、验证结果、残余风险。
