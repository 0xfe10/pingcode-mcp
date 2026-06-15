# Design: 核心闭环补齐（创建 / 批量 / 流转预检）

## API Mapping（官方源 open.pingcode.com/api_data.json 核实）

| 能力 | 端点 | 关键参数 |
| --- | --- | --- |
| 创建工作项 | `POST /v1/project/work_items` | 必填 `project_id`/`type_id`/`title`；可选 `description`/`priority_id`/`assignee_id`/`parent_id`/`state_id`/`properties`。返回含 `id`/`identifier` |
| 原生批量改字段 | `PATCH /v1/project/work_items` | body `{ ids:[≤100], property_name, property_value }`；单次一个字段。`property_name` 含 `state_id`/`priority_id`/`assignee_id`/`title`/`description`… |
| 状态方案列表 | `GET /v1/project/work_item_state_plans?project_id=` | 返回 `values[].{ id, project_type, work_item_type }` |
| 合法流转 | `GET /v1/project/work_item_state_plans/{state_plan_id}/work_item_state_flows?from_state_id=` | 返回从当前状态可达的目标状态 |

## Tool 1: pingcode_create_work_item（写，dryRun 默认 true）

### schema（schemas.ts）
```ts
export const createWorkItemSchema = {
  kind: z.enum(["bug","requirement"]).default("bug").optional(),
  title: z.string().min(1).describe("工作项标题（必填）。"),
  description: z.string().optional(),
  priorityName: z.string().optional(),
  assigneeName: z.string().optional(),
  statusName: z.string().optional().describe("初始状态名；不传则用类型默认初始态（推荐不传，避免流转校验失败）。"),
  parent: z.string().optional().describe("父工作项编号或内部 ID。"),
  properties: z.record(z.unknown()).optional(),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回创建计划；false 才真正创建。"),
  ...projectScope,
};
```

### service.createWorkItem(options)
- `getKindSchema(kind)` 拿 project/type/states/priorities/members。
- 组 `WorkItemPayload`：`project_id`+`type_id`+`title` 必填；`description`/`priority_id`(resolveNamed)/`assignee_id`(resolveMember)/`parent_id`(resolveParentId)/`state_id`(resolveNamed, 仅当传 statusName)/`properties`。
- 走 `runMutation(dryRun, …)`：plan = 待提交 payload + 解析结果；execute = `client.createWorkItem(payload)` → `summarizeWorkItem`。`noChange` 恒 false（创建总是有变更）。
- 复用现有 `resolveNamed`/`resolveMember`/`resolveParentId`/`runMutation`/`summarizeWorkItem`。

## Tool 2: pingcode_bulk_update_work_items（写，dryRun 默认 true）

### schema
```ts
export const bulkUpdateWorkItemsSchema = {
  kind: z.enum(["bug","requirement"]).default("bug").optional(),
  identifiers: z.array(z.string()).min(1).max(100).describe("要批量更新的工作项编号列表，≤100。"),
  priorityName: z.string().optional(),
  assigneeName: z.string().optional(),
  statusName: z.string().optional(),
  stateId: z.string().optional(),
  expectedCurrentStatusName: z.string().optional().describe("当前状态保护：不匹配的条目被跳过。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回计划；false 才执行。"),
  ...projectScope,
};
```

### service.bulkUpdateWorkItems(options)
1. `getKindSchema`；解析目标值：priority→id、assignee→id、status/stateId→state_id（至少要有一个目标字段，否则报错）。
2. 逐编号 `findByIdentifier` 解析为 item（拿到 id 与当前 state）：
   - 找不到 → `failed.push({identifier, error:"未找到工作项"})`
   - `expectedCurrentStatusName` 不匹配 → `skipped.push({identifier, currentStatus, reason})`
   - 否则 → `planned.push({identifier, id, fromStatus, changes})`，收集 eligible id。
3. `dryRun` → 返回 `{dryRun:true, total, planned, skipped, failed, fields}`。
4. 否则 `assertWritable`；对每个要改的字段（priority_id/assignee_id/state_id）各发**一次** `client.bulkUpdateWorkItems(eligibleIds, property_name, property_value)`；汇总 `executed:[{field, ids, ok, error?}]`。
   - 任一字段 bulk 失败：记录该字段 error，继续其余字段（不整体回滚——PingCode 无事务）。
- 返回结构沿用 `mark_bugs_fixed` 风格（planned/skipped/failed/executed），保证一致性。

## Tool 3: 升级 pingcode_plan_status_change（仍只读）

### client 新增
```ts
async getWorkItemStatePlans(projectId: string): Promise<WorkItemStatePlan[]>   // GET work_item_state_plans?project_id
async getWorkItemStateFlows(statePlanId: string, fromStateId: string): Promise<WorkItemStateFlow[]>
```

### service.planStatusChange 升级
- 现有逻辑保留（target/currentStatus/toStatus/availableStates/expectedSatisfied/willChange）。
- 新增：解析 `state_plan_id` = `getWorkItemStatePlans(projectId)` 里按 `project_type === project.type` 且 `work_item_type === schema.type.id`（或 name）匹配的 `id`。
- 若解析到且有 `currentStateId`：`getWorkItemStateFlows(statePlanId, currentStateId)` → `allowedTransitions:[{id,name}]`；`transitionAllowed` = 目标 stateId 是否在其中（无目标时 undefined）。
- 失败/解析不到 → `allowedTransitions: undefined`，`note` 标注"未能解析状态方案，无法预检合法流转，目标转换以实际 PATCH 为准"。
- 解析到时 `note` 改为"已基于工作流预检合法流转"。
- **保持只读**：不调 `update`、不调 `assertWritable`；向后兼容（仅新增返回字段）。

## 类型新增（types.ts）
```ts
export interface WorkItemStatePlan { id: string; name?: string; project_type?: string; work_item_type?: string; }
export interface WorkItemStateFlow { id?: string; from_state_id?: string; to_state_id?: string; to_state?: { id: string; name?: string }; }
export interface BulkUpdatePayload { ids: string[]; property_name: string; property_value: string; }
```

## 安全与一致性
- dryRun 矩阵：create=默认 true、bulk=默认 true、plan=只读无 dryRun。
- readonly：create/bulk 写前经 `runMutation` 的 `assertWritable`；plan 不触发。
- 幂等/保护：bulk 支持 `expectedCurrentStatusName` 跳过；无乐观锁，写前比对到此为止。
- 错误脱敏：handler 走 `errorResult` 仅回 message；不回传 responseText。
- Long/ID 全程 string。

## 文件改动清单（最小 diff，不破坏现有 18 工具）
| 文件 | 改动 |
| --- | --- |
| `src/tools/schemas.ts` | 新增 createWorkItemSchema / bulkUpdateWorkItemsSchema |
| `src/pingcode/types.ts` | 新增 WorkItemStatePlan / WorkItemStateFlow / BulkUpdatePayload |
| `src/pingcode/client.ts` | 新增 bulkUpdateWorkItems / getWorkItemStatePlans / getWorkItemStateFlows |
| `src/pingcode/workItemService.ts` | 新增 createWorkItem / bulkUpdateWorkItems；升级 planStatusChange |
| `src/index.ts` | 注册 pingcode_create_work_item / pingcode_bulk_update_work_items；plan handler 不变 |
| `README.md` | 工具表 + 用法 |
