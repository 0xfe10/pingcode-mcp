# Proposal: 工作项关系/依赖 + 个人统一工作台

## Why

对标 Jira issue links 与 Linear "My Issues"，pingcode-mcp 目前：

1. **只有父子层级，没有关系/依赖**：无法表达"阻塞/被阻塞/重复/关联/克隆/起因"等 Jira links 关系。PingCode 原生支持 relations（`POST/GET/DELETE /v1/project/work_items/{id}/relations`，含 block/blocked_by/duplicate/relate/cause/dependency 等全枚举）。
2. **没有个人统一工作台**：`list_my_bugs` / `list_my_requirements` 分散，回答不了"我现在手上有什么、按状态分布如何"。

本波把这两块补齐，保持研发/QA 闭环定位，按现有分层独立实现。

## What Changes

新增 4 个工具：

- **`pingcode_link_work_items`**（写，dryRun 默认 true）：在两条工作项间建立关系（阻塞/被阻塞/重复/关联/克隆/起因/依赖等），按名或内部 ID 定位源与目标。
- **`pingcode_unlink_work_items`**（写，dryRun 默认 true）：按 relationId 删除一条关系。
- **`pingcode_list_work_item_relations`**（只读）：列出某工作项的关系，可按 relationType 过滤。
- **`pingcode_get_my_work`**（只读）：聚合"我的"缺陷+需求，按状态分组并给出计数，支持状态/更新时间过滤、负责人覆盖。

配套：`client.ts` 加 `getRelationTypes`/`listWorkItemRelations`/`createWorkItemRelation`/`deleteWorkItemRelation`；`types.ts` 加 `RelationType`/`WorkItemRelation`；`workItemService.ts` 加对应方法 + `getMyWork` + `resolveRelationType`；`schemas.ts` 加 4 个 schema；README 更新。

## Scope

包含：上述 4 工具及 client/service/types/schema/README、OpenSpec 文档、`npm run check`/`build` 与运行时 dryRun/readonly 验证。

不包含（留后续）：sprint/version/tags/participants（③）、导出/附件（④）、关系类型的创建/管理（只读消费现有 relation_types）。

非目标：不提交凭据；不破坏现有 23 工具；不打 headers/Authorization 日志。

## Success Criteria

- `npm run check`、`npm run build` 通过。
- `src/index.ts` 出现 4 个新工具；工具总数 27。
- `link_work_items` / `unlink_work_items` dryRun 默认 true，`PINGCODE_READONLY=true` 拒绝。
- `list_work_item_relations` / `get_my_work` 只读。
- relationType 支持系统枚举值，也能按名解析（经 relation_types）。
- README Tools 表含 4 个新工具。
- 现有 23 工具向后兼容；错误只回 message。

## Risks and Mitigations

- **relation_type 取值（系统枚举 vs 自定义 id）**：→ `resolveRelationType` 先认系统枚举（block/blocked_by/…）直接透传，否则经 `getRelationTypes` 按名/ID 匹配，失败回退原值。
- **目标工作项跨类型**：链接的 target 可能与 source 不同 kind。→ target 解析用 findByIdentifier（带 project，不限定 type），拿到内部 id 即可。
- **关系方向语义**：block=源阻塞目标、blocked_by=源被目标阻塞。→ schema describe 明确方向。
- **删除需 relationId**：→ `unlink` 要求显式 relationId（由 `list_work_item_relations` 获得），避免误删；dryRun 默认 true 先回计划。
- **凭据/脱敏**：→ handler 走 errorResult 仅回 message。
