# Proposal: 吸收竞品的目录查询与 raw 过滤能力

## Why

竞品 `shaunxu/pingcode-mcp-server` 有两点对研发/QA 闭环有价值、而我们暂缺：

1. **目录类查询**：拿不到"当前企业 / 当前用户 / 企业成员"，AI 无法回答"我是谁、团队里有谁、某部门有哪些人"，也无法把负责人姓名映射回组织成员。
2. **工作项过滤维度太窄**：`pingcode_search_work_items` 现仅支持 state/priority/assignee/keywords/updated 时间，缺少 PingCode 原生支持的 parent/tag/sprint/version/board/created 等大量过滤维度。

我们保持产品定位（研发/QA 闭环工作台，而非 Open API 透传）：只吸收能力点，按现有分层独立实现，不复制竞品源码。

## What Changes

新增 3 个目录工具 + 扩展 1 个搜索工具：

- **`pingcode_get_current_team`**：返回当前企业信息（`GET /v1/directory/team`）。
- **`pingcode_get_current_user`**：返回当前用户；client_credentials 应用态无登录用户时**降级**为返回配置的默认负责人（`PINGCODE_DEFAULT_ASSIGNEE_NAME`，并在企业成员中解析），并标注应用身份。
- **`pingcode_get_team_members`**：企业成员列表（`GET /v1/directory/users`），支持 `keywords`、`departmentIds`、分页。
- **扩展 `pingcode_search_work_items`**：新增 raw id 过滤（projectIds/typeIds/parentIds/assigneeIds/stateIds/priorityIds/tagIds/sprintIds/boardIds/entryIds/swimlaneIds/phaseIds/versionIds/createdByIds/participantId）与时间/布尔过滤（createdBetween/startBetween/endBetween/includeDeleted/includeArchived）。保留现有 name-based 参数（stateNames/priorityNames/assigneeNames），raw id 与 name 解析结果**合并去重**。

配套：`client.ts` 加 `getCurrentTeam`/`getCurrentUser`/`listEnterpriseUsers`；`types.ts` 加 `PingCodeTeam`/`PingCodeUser` 与扩展 `WorkItemListQuery`；`workItemService.ts` 加目录方法、扩展 `list`/`searchWorkItems`；`schemas.ts` 加 3 个目录 schema 与扩展 search schema；README 更新。

## Scope

包含：上述 3 新增工具 + search 扩展及其 client/service/types/schema/README 改动、OpenSpec 文档、`npm run check`/`build` 验证。

不包含：不复制竞品源码；不新增低级 raw 透传工具（复用 search）；不暴露 departments/groups/jobs/roles 独立工具（本次不需要）；不引入新框架/不重构目录。

非目标：不提交真实凭据；不破坏现有 20 个工具；不把 Authorization/headers 打日志。

## Success Criteria

- `npm run check`、`npm run build` 通过。
- `src/index.ts` 出现 3 个新工具：`pingcode_get_current_team`/`pingcode_get_current_user`/`pingcode_get_team_members`。
- `pingcode_search_work_items` schema 含全部 raw filter 参数。
- raw id 与 name 参数同传时合并去重；多值 ≤20。
- `pingcode_get_current_user` 在应用态不报错、给出降级结果。
- README Tools 表含 3 个目录工具，搜索说明补 raw filters。
- 现有 20 工具向后兼容；错误只回 message。

## Risks and Mitigations

- **current_user 在 client_credentials 不可用**：`/v1/myself` 仅用户令牌。→ 仅当配置了 `PINGCODE_ACCESS_TOKEN` 才尝试；失败/无 token 则降级为应用身份 + 配置默认负责人，绝不抛错。
- **多值参数上限 20**：PingCode `*_ids` ≤20。→ service 层 `slice(0,20)` 截断，describe 标注。
- **raw typeIds/projectIds 与 kind/项目解析冲突**：→ 与解析出的 kind type、主项目 id **合并去重**；并对 search 最终结果按工作项 id 去重，避免跨 kind 重复。
- **时间区间格式**：created/start/end_between 是秒级时间戳 `起,止`（支持单边）。→ 作为 raw 字符串透传，describe 注明格式；现有 updatedAfter/updatedBefore 的 ISO 友好路径保持不变。
- **凭据泄露**：→ handler 走 errorResult 仅回 message；不打 headers/Authorization。
