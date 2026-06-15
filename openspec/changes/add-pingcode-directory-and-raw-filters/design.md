# Design: 目录查询 + raw 过滤

## API Mapping（open.pingcode.com/api_data.json 核实）

| 能力 | 端点 | client_credentials | 关键参数 |
| --- | --- | --- | --- |
| 当前企业 | `GET /v1/directory/team` | ✅ | 无 |
| 当前用户 | `GET /v1/myself` | ❌ 仅用户令牌 | 无（降级处理） |
| 企业成员 | `GET /v1/directory/users` | ✅ | `keywords`、`department_ids`(≤20)、分页 |
| 工作项列表 | `GET /v1/project/work_items` | ✅ | 见下方 raw filter 清单 |

### work_items raw filter（snake_case，均确认）
`parent_ids`/`tag_ids`/`sprint_ids`/`board_ids`/`entry_ids`/`swimlane_ids`/`phase_ids`/`version_ids`/`created_by_ids` 逗号分隔 ≤20；`participant_id` 单值；`created_between`/`start_between`/`end_between` 为 `起,止` 秒级时间戳（支持单边）；`include_deleted`/`include_archived` 布尔默认 false。

## 目录工具

### pingcode_get_current_team（只读，无参）
- client `getCurrentTeam(): Promise<PingCodeTeam>` → `GET /v1/directory/team`（直接返回对象，非分页）。
- service `getCurrentTeam()` 透传。

### pingcode_get_current_user（只读，无参，含降级）
- client `getCurrentUser(): Promise<PingCodeUser>` → `GET /v1/myself`。
- service `getCurrentUser()`：
  - 仅当 `config.accessToken` 存在时 try `client.getCurrentUser()` → `{ mode:"user", user }`。
  - 否则 / 失败 → 降级：`{ mode:"application", note:"当前为应用身份(client_credentials)，PingCode 无当前登录用户；以下为 MCP 配置的默认负责人。", defaultAssigneeName: config.defaultAssigneeName ?? null, resolved? }`；`resolved` 由 `listEnterpriseUsers({keywords: defaultAssigneeName})` 解析首个匹配（try/catch 包裹，失败留空）。
  - **绝不抛错**。

### pingcode_get_team_members（只读）
- schema：`keywords?`、`departmentIds?: string[]`、`pageIndex?`、`pageSize?`。
- client `listEnterpriseUsers(query): Promise<PageResponse<PingCodeUser>>` → `GET /v1/directory/users`。
- service `listTeamMembers(options)`：`department_ids = departmentIds?.slice(0,20).join(",")`；返回 `{ total, pageIndex, pageSize, values }`。

## search 扩展（复用 pingcode_search_work_items）

### schema 新增（schemas.ts，全部 optional）
- 数组 raw id：`projectIds`/`typeIds`/`parentIds`/`assigneeIds`/`stateIds`/`priorityIds`/`tagIds`/`sprintIds`/`boardIds`/`entryIds`/`swimlaneIds`/`phaseIds`/`versionIds`/`createdByIds`（`z.array(z.string())`）。
- 单值：`participantId`（`z.string()`）。
- 时间 raw：`createdBetween`/`startBetween`/`endBetween`（`z.string()`，describe 标注秒级时间戳 `起,止` 支持单边）。
- 布尔：`includeDeleted`/`includeArchived`（`z.boolean()`）。
- 保留 `stateNames`/`priorityNames`/`assigneeNames`/`updatedAfter`/`updatedBefore` 不变。

### ListOptions 扩展（workItemService.ts）
对应加上以上 camelCase 可选字段（id 类为 `string[]`，时间/单值为 `string`，include 为 `boolean`）。

### list() 合并逻辑（核心）
```ts
const joinCap = (arr?: string[]) => { const v = [...new Set((arr ?? []).filter(Boolean))].slice(0,20); return v.length ? v.join(",") : undefined; };
const merge = (resolved: string[], raw?: string[]) => joinCap([...resolved, ...(raw ?? [])]);

const stateIds = this.namesToIds(options.stateNames, schema.states, "状态");
const priorityIds = this.namesToIds(options.priorityNames, schema.priorities, "优先级");
const assigneeIds = this.memberNamesToIds(options.assigneeNames, schema.members);

return this.client.listWorkItems({
  project_ids: merge([schema.project.id], options.projectIds),
  type_ids: merge([schema.type.id], options.typeIds),
  state_ids: merge(stateIds, options.stateIds),
  priority_ids: merge(priorityIds, options.priorityIds),
  assignee_ids: merge(assigneeIds, options.assigneeIds),
  parent_ids: joinCap(options.parentIds),
  tag_ids: joinCap(options.tagIds),
  sprint_ids: joinCap(options.sprintIds),
  board_ids: joinCap(options.boardIds),
  entry_ids: joinCap(options.entryIds),
  swimlane_ids: joinCap(options.swimlaneIds),
  phase_ids: joinCap(options.phaseIds),
  version_ids: joinCap(options.versionIds),
  created_by_ids: joinCap(options.createdByIds),
  participant_id: options.participantId,
  created_between: options.createdBetween,
  start_between: options.startBetween,
  end_between: options.endBetween,
  include_deleted: options.includeDeleted,
  include_archived: options.includeArchived,
  keywords: options.keywords,
  include_public_image_token: options.includePublicImageToken,
  page_index: options.pageIndex,
  page_size: options.pageSize,
  updated_between: options.updatedBetween,
});
```
- 现有 list_bugs / list_my_* 不传 raw 字段 → `merge([id], undefined)` = 原值，**完全向后兼容**。

### searchWorkItems 透传 + 去重
- 把所有新 raw 字段从 options 透传给每个 kind 的 `list(kind, …)`。
- 最终 `values` 按工作项 `id` 去重（避免 raw typeIds 跨 kind 重复计入）。

## 类型新增（types.ts）
```ts
export interface PingCodeTeam { id: string; name?: string; [k: string]: unknown; }
export interface PingCodeUser { id: string; name?: string; display_name?: string; email?: string; [k: string]: unknown; }
// WorkItemListQuery 增补：parent_ids/tag_ids/sprint_ids/board_ids/entry_ids/swimlane_ids/phase_ids/version_ids/created_by_ids?: string；participant_id?: string；created_between/start_between/end_between?: string；include_deleted/include_archived?: boolean
// PingCodeUser 用 index signature 接住未知字段，避免 any。
```

## 安全
- 目录工具只读，不触发写；search 只读。
- 错误走 `errorResult`（只回 message）；不打 headers/Authorization。
- 现有 dryRun / readonly 写策略不动。

## 文件改动清单
| 文件 | 改动 |
| --- | --- |
| `src/tools/schemas.ts` | 加 getCurrentTeamSchema/getCurrentUserSchema/getTeamMembersSchema；扩展 searchWorkItemsSchema |
| `src/pingcode/types.ts` | 加 PingCodeTeam/PingCodeUser；扩展 WorkItemListQuery |
| `src/pingcode/client.ts` | 加 getCurrentTeam/getCurrentUser/listEnterpriseUsers |
| `src/pingcode/workItemService.ts` | 加 getCurrentTeam/getCurrentUser/listTeamMembers；扩展 ListOptions/list/searchWorkItems + 去重 |
| `src/index.ts` | 注册 3 个目录工具；search handler 透传新参数（schema 扩展即可） |
| `README.md` | Tools 表 + raw filters 说明 + 示例 |
