# Design: 关系/依赖 + 个人工作台

## API Mapping（open.pingcode.com/api_data.json 核实）

| 能力 | 端点 |
| --- | --- |
| 关系类型枚举 | `GET /v1/project/work_item/relation_types` → `{id,name,category,is_system}` |
| 列关系 | `GET /v1/project/work_items/{id}/relations?relation_type=` |
| 建关系 | `POST /v1/project/work_items/{id}/relations`，body `{ target_work_item_id, relation_type }` |
| 删关系 | `DELETE /v1/project/work_items/{id}/relations/{relation_id}` |
| 我的工作 | 复用 `GET /v1/project/work_items`（assignee_ids = 默认负责人解析 id） |

relation_type 系统枚举：`block`/`blocked_by`/`relate`/`duplicate`/`cause`/`caused_by`/`clone`/`cloned_by`/`dependency`/`mention`，或自定义关系类型 id。

## 类型（types.ts）
```ts
export interface RelationType { id: string; name?: string; category?: string; is_system?: boolean; [k: string]: unknown; }
export interface WorkItemRelation { id: string; relation_type?: string; target_work_item?: PingCodeRef; [k: string]: unknown; }
```

## Client（client.ts）
```ts
async getRelationTypes(): Promise<RelationType[]>                       // GET .../relation_types → page.values
async listWorkItemRelations(workItemId, relationType?): Promise<PageResponse<WorkItemRelation>>
async createWorkItemRelation(workItemId, body: { target_work_item_id: string; relation_type: string }): Promise<WorkItemRelation>
async deleteWorkItemRelation(workItemId, relationId): Promise<unknown>
```

## Service（workItemService.ts）

### resolveRelationType（私有）
```ts
const SYSTEM_RELATION_TYPES = ["block","blocked_by","relate","duplicate","cause","caused_by","clone","cloned_by","dependency","mention"];
private async resolveRelationType(input: string): Promise<string> {
  const norm = normalizeName(input);
  if (SYSTEM_RELATION_TYPES.includes(norm)) return norm;          // 系统枚举直接用
  try {
    const types = await this.client.getRelationTypes();
    const m = types.find(t => normalizeName(t.id) === norm || (t.name && normalizeName(t.name) === norm) || (t.category && normalizeName(t.category) === norm));
    if (m) return m.id;
  } catch { /* 回退 */ }
  return input;                                                    // 回退原值
}
```

### linkWorkItems（写）
- 入参：`kind?`、源 `identifier?/workItemId?`、目标 `targetIdentifier?/targetWorkItemId?`、`relationType`、`dryRun`(默认 true)、projectScope。
- 解析：源用 `resolveWorkItemStrict`；目标 id = `targetWorkItemId ?? findByIdentifier(targetIdentifier).id`（带 project，不限定 type）；relationType 经 `resolveRelationType`。
- 走 `runMutation(dryRun)`：plan = `{ source, target, relationType }`，noChange=false，execute = `client.createWorkItemRelation(sourceId, { target_work_item_id, relation_type })`。

### unlinkWorkItems（写）
- 入参：`kind?`、`identifier?/workItemId?`、`relationId`(必填)、`dryRun`(默认 true)、projectScope。
- 解析源 → `runMutation(dryRun)`：plan = `{ source, relationId }`，execute = `client.deleteWorkItemRelation(sourceId, relationId)`。

### listWorkItemRelations（只读）
- 入参：`kind?`、`identifier?/workItemId?`、`relationType?`、projectScope。
- 解析源 → relationType（如传，经 resolveRelationType）→ `client.listWorkItemRelations(sourceId, relationType)`，返回 `{ target, total, values }`。

### getMyWork（只读）
- 入参：`assigneeName?`(覆盖默认)、`kinds?`(默认 ["bug","requirement"])、`stateNames?`、`updatedAfter?`、`updatedBefore?`、`pageSize?`、projectScope。
- assignee = `assigneeName ?? config.defaultAssigneeName`（缺失则报错，复用现有提示）。
- 对每个 kind `list(kind, { assigneeNames:[assignee], stateNames, updatedBetween, pageSize })`，用 `summarizeWorkItem` 映射。
- 按 `state`(状态名) 分组：返回 `{ assigneeName, total, groups: [{ status, count, items }] }`，items 已按 id 去重。

## Schemas（schemas.ts）
- `linkWorkItemsSchema`：kind?、workItemLocator（源）、`targetIdentifier?`/`targetWorkItemId?`、`relationType`(z.string，describe 列系统枚举+方向)、`dryRun`(默认 true)、projectScope。
- `unlinkWorkItemsSchema`：kind?、workItemLocator、`relationId`(必填)、`dryRun`(默认 true)、projectScope。
- `listWorkItemRelationsSchema`：kind?、workItemLocator、`relationType?`、projectScope。
- `getMyWorkSchema`：`assigneeName?`、`kinds?`(默认 both)、`stateNames?`、`updatedAfter?`、`updatedBefore?`、`pageSize?`、projectScope。

## index.ts
注册 `pingcode_link_work_items` / `pingcode_unlink_work_items` / `pingcode_list_work_item_relations` / `pingcode_get_my_work`，handler ≤15 行，中文 description，走 service + textResult/errorResult。

## 安全
- link/unlink 走 runMutation（dryRun 默认 true + assertWritable 写前拦截）。
- list/my_work 只读。
- 错误走 errorResult 仅回 message；不打 headers。
- 现有写策略与 23 工具不动。

## 文件改动清单
| 文件 | 改动 |
| --- | --- |
| `src/pingcode/types.ts` | 加 RelationType / WorkItemRelation |
| `src/pingcode/client.ts` | 加 getRelationTypes / listWorkItemRelations / createWorkItemRelation / deleteWorkItemRelation |
| `src/pingcode/workItemService.ts` | 加 resolveRelationType / linkWorkItems / unlinkWorkItems / listWorkItemRelations / getMyWork |
| `src/tools/schemas.ts` | 加 4 个 schema |
| `src/index.ts` | 注册 4 个工具 |
| `README.md` | Tools 表 + 用法 + 示例 |
