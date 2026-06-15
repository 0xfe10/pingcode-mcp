# Proposal: PingCode MCP 核心闭环补齐（创建 / 批量 / 流转预检）

## Why

对标 Jira / Linear / GitHub Issues，pingcode-mcp 当前 18 个工具仍缺三项研发日常"必备"能力，且都已被 PingCode Open API 官方支持（`open.pingcode.com/api_data.json` 核实）：

1. **不能单条创建工作项**：只能用 `.xlsx/.csv` 批量导入，无法用一句自然语言新建一条 bug/需求——而每个主流 issue tracker 都有"create issue"。
2. **没有原生批量编辑**：只有 `pingcode_mark_bugs_fixed`（仅改状态、循环单条 PATCH）。Jira 的 bulk edit 是高频 triage/QA 动作，PingCode 有原生 `PATCH /v1/project/work_items`（≤100 条）可用。
3. **状态变更计划不校验合法流转**：`pingcode_plan_status_change` 现在只列出该类型全部状态，不知道当前状态"能转到哪些"。此前误判为"PingCode 无工作流校验端点"，实际有 `work_item_state_flows` 可做真实合法流转预检。

## What Changes

新增 2 个工具 + 升级 1 个工具：

- **新增 `pingcode_create_work_item`**：按 kind + 标题（必填）+ 描述/优先级/负责人/父项/properties 创建单条工作项，`dryRun` 默认 true。
- **新增 `pingcode_bulk_update_work_items`**：对一批编号原生批量改优先级 / 负责人 / 状态，沿用 `planned/skipped/failed` 模式 + `expectedCurrentStatusName` 保护，`dryRun` 默认 true。
- **升级 `pingcode_plan_status_change`**：接 `work_item_state_plans` + `work_item_state_flows`，返回"当前状态可合法流转到的目标状态"，并标注请求的目标是否被工作流允许；解析不到时回退到现有"列全部状态"行为。

配套：

- `PingCodeClient` 新增 `bulkUpdateWorkItems`、`getWorkItemStatePlans`、`getWorkItemStateFlows`（`createWorkItem` 已存在）。
- `WorkItemService` 新增 `createWorkItem`、`bulkUpdateWorkItems`，升级 `planStatusChange`。
- `types.ts` 新增 `WorkItemStatePlan` / `WorkItemStateFlow` / 批量请求类型。
- `schemas.ts` 新增 `createWorkItemSchema` / `bulkUpdateWorkItemsSchema`。
- README 增补工具表与用法。

## Scope

包含：上述 2 新增 + 1 升级工具及其 client/service/types/schema/README 改动、OpenSpec 文档、`npm run check`/`build` 与 dryRun/readonly 运行时验证。

不包含（留作下一波，已在 README Roadmap）：关系/依赖、个人工作台、sprint/version、tags/participants、附件、导出、changelog、webhook。

非目标：不提交真实凭据；不破坏现有 18 个工具；不引入框架；不实现删除/归档。

## Success Criteria

- `npm run check`、`npm run build` 通过。
- 新工具出现在 README Tools 表：`pingcode_create_work_item`、`pingcode_bulk_update_work_items`。
- 两个写工具 `dryRun=true` 不发任何写请求；`PINGCODE_READONLY=true` 拒绝执行。
- `pingcode_plan_status_change` 返回合法流转列表（解析到 state_plan 时），且保持只读、向后兼容。
- 现有 18 个工具向后兼容。
- 错误脱敏，不泄露 token/secret/响应体。

## Risks and Mitigations

- **创建时 state_id 易失败**：初始状态必须符合状态方案与流转。→ `create` 的 `statusName` 设为可选且默认省略，由 PingCode 用默认初始态；显式传入失败时回传后端原始错误信息。
- **批量端点单次仅改一个字段**：原生 bulk `property_name` 单值。→ 多字段时按字段拆成多次 bulk PATCH；返回结构标明每个字段的执行结果。
- **identifier→id 解析成本**：bulk 需要内部 id。→ 沿用 `mark_bugs_fixed` 的逐编号解析（≤100），解析失败计入 `failed`，不阻断其余。
- **state_plan 解析失败**：按 `project_type`+`work_item_type` 匹配不到时。→ `plan_status_change` 回退到现有"列全部状态"，并在 `note` 标注未能预检。
- **并发覆盖**：无乐观锁。→ bulk 与 plan 均支持/标注 `expectedCurrentStatusName`，写前 `assertWritable`。
