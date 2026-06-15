# Design: PingCode MCP 闭环工作台

## Architecture

```text
AI Client
  -> stdio MCP server (src/index.ts)        # 工具注册 + 薄 handler
    -> zod inputSchema (src/tools/schemas.ts) # 新工具入参（现有 schema 原地不动）
    -> WorkItemService (业务编排)
       - plan -> execute（runMutation 统一骨架）
       - name -> id 解析（state/priority/member/parent）
       - 跨 kind 合并、字段 diff、幂等、保护条件
    -> PingCodeClient (纯 HTTP)
       -> /v1/project/work_items*, /v1/comments, /v1/auth/token ...
```

分层边界不变：`PingCodeClient` 只做一次 HTTP 请求粒度；`WorkItemService` 做编排、解析、dryRun/plan/execute、assertWritable。

## Tool 分层设计

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| index.ts 是否拆分 | **不拆注册，抽新 schema 到 `src/tools/schemas.ts`** | index.ts 现 380 行，加 5 工具约到 ~550 行。把新 schema 外置后 handler 仍集中、每个 ≤15 行；现有 7 个 schema 原地不动，最大化向后兼容，避免 registry 抽象带来的大面积 diff。 |
| 写操作入口 | **统一经过 plan→execute（`runMutation`）** | dryRun 默认值、`assertWritable` 写前单点拦截、无变化跳过（幂等）三件事集中保证，新写工具行为一致。 |
| Client 新增 | **仅 `getWorkItem(workItemId)`** | 现状按 id 取详情靠 `resolveWorkItem` 内存 filter（拉 100 条再 find，>100 漏、拿不到富字段）。单条详情端点已确认存在。 |

## API Mapping（含真实性核实）

证据等级：**【代码已用】** 现有代码已证明可用 / **【官方文档】** PingCode Apifox 官方端点佐证 / **【降级】** 不支持或未文档化，需降级。

| Capability | PingCode API | 证据 | 用于工具 |
| --- | --- | --- | --- |
| 单条工作项详情 | `GET /v1/project/work_items/{id}` | 【官方文档】api-115141899 | get_work_item |
| 工作项列表 / 搜索 | `GET /v1/project/work_items` | 【代码已用】 | search / list |
| 按更新时间过滤 | `updated_between=<start>,<end>`（10 位时间戳，逗号分隔；另有 `created_between`） | 【官方文档】api-115142016 | search |
| 多条件过滤 | `type_ids/state_ids/priority_ids/assignee_ids/project_ids/keywords`（逗号分隔多值，**每项 ≤20**） | 【官方文档】+【代码已用】 | search / list |
| 跨 type 一次查 | `type_ids` 传多值 | 【官方文档】api-115142016 | search（本设计仍按 kind 分别查再合并，见下） |
| 部分更新工作项 | `PATCH /v1/project/work_items/{id}`（title/description/state_id/priority_id/assignee_id/parent_id/properties 全可选） | 【代码已用】+【官方文档】api-115134401 | update_fields / triage |
| 状态可用流转（只读） | `GET /v1/project/work_item_state_plans/{state_plan_id}/work_item_state_flows?from_state_id=` | 【官方文档】api-136774623 | plan_status_change 的 P1 可选预校验 |
| 评论读 / 写 | `GET /v1/comments`、`POST /v1/comments`（principal_type=work_item） | 【代码已用】 | triage / get_work_item |
| 状态变更执行端点 | **无独立 transition 执行 / 校验端点**，改状态 = PATCH `state_id` | 【降级】 | plan_status_change 只展示 |
| 乐观锁 / 版本号 | **无 version/etag 字段** | 【降级】 | 弱幂等替代 |
| changelog / history | `GET .../{id}/transition_histories`（仅流转）、`GET /v1/activities`（标"开发中"，schema 空） | 【降级 → P1】 | Roadmap |
| webhook | **Open API 无 webhook 资源**（423 端点全扫确认） | 【降级 → Roadmap】 | 增量同步只能 `updated_between` 轮询 |

## 5 个 P0 工具设计

### 1. pingcode_get_work_item（只读）

- 入参：`kind?`(默认 bug) / `identifier?` / `workItemId?` / `includeComments?`(默认 false) / `includeImages?`(默认 true) / `projectIdentifier?` / `projectId?`。
- Service：新增 `getWorkItemDetail(options)`。`workItemId` 优先 → `client.getWorkItem(id)`（可靠完整）；否则 `findByIdentifier` 解析。`includeComments` 时调 `listWorkItemComments`。
- 输出：新增导出 `detailWorkItem(item, baseUrl, { includeImages })`，在 `summarizeWorkItem` 基础上叠加 `description / created_at / updated_at / parent / properties`，可选 `comments`。
- `summarizeWorkItem` 不改（现有 13 工具依赖）。

### 2. pingcode_search_work_items（只读）

- 入参：`kinds`(默认 `["bug","requirement"]`) / `keywords?` / `stateNames?` / `priorityNames?` / `assigneeNames?` / `updatedAfter?` / `updatedBefore?` / `pageIndex?` / `pageSize?` / 项目定位。
- Service：新增 `searchWorkItems(options)`。对每个 kind 各自 `getKindSchema` 解析（状态/优先级按各自类型解析，避免跨类型解析错误），调现有 `list(kind, ...)`，用 `summarizeWorkItem` 映射后合并。
- `updatedAfter/updatedBefore`：映射为服务端 `updated_between`（`updatedAfter`→`start`，`updatedBefore`→`end`，ISO/yyyy-MM-dd → 10 位秒级时间戳）。`types.ts` 的 `WorkItemListQuery` 增补可选 `updated_between`，`WorkItemService.list` 透传。
- 输出：`{ total, byKind:[{kind,total,pageIndex,pageSize}], values: summarizeWorkItem[] }`。`byKind[].total` 为各 kind 服务端原始 total，`values` 为合并后映射结果。

### 3. pingcode_plan_status_change（只读，无 dryRun）

- 入参：`kind?` / `identifier?` / `workItemId?` / `statusName?`(目标) / `stateId?` / `expectedCurrentStatusName?` / 项目定位。**不暴露 dryRun**（设计上恒只读，避免误导）。
- Service：新增 `planStatusChange(options)`。`getKindSchema` + `resolveWorkItemStrict` + `resolveNamed(statusName, states)`。**不调 `update`、不调 `assertWritable`**。
- 输出：`{ target, currentStatus, currentStateId, toStatus?, toStateId?, availableStates:[{id,name}], expectedCurrentStatusName?, expectedSatisfied?, willChange }`。
- 降级标注：因 PingCode 无工作流校验端点，返回里说明"目标转换是否被工作流允许需以实际 PATCH 为准"。

### 4. pingcode_update_work_item_fields（写，dryRun 默认 true）

- 入参：`kind?` / `identifier?` / `workItemId?` / `title?` / `description?` / `priorityName?` / `assigneeName?` / `parent?` / `properties?` / `expectedCurrentStatusName?` / `dryRun`(默认 true) / 项目定位。
- Service：新增 `updateWorkItemFields(options)`。`resolveWorkItemStrict` 拿当前态 → `resolveNamed`(priority)/`resolveMember`(assignee)/`resolveParentId`(parent) 把名转 id → **只对真正变化的字段**组 PATCH payload（不带 project_id/type_id）。
- 幂等：对比当前值与目标值，无变化 `noChange=true` 跳过 PATCH。`expectedCurrentStatusName` 不匹配则拒绝执行（throw）。
- 输出：`{ dryRun, target, payload, changes:[{field,from,to}], noChange, expectedSatisfied?, updated? }`。
- 关于乐观锁：PingCode 无 version 字段，故用 `expectedCurrentStatusName` + 写前比对做弱幂等（schema describe 说明原因）。

### 5. pingcode_triage_work_item（写，dryRun 默认 true）

- 入参：`kind?` / `identifier?` / `workItemId?` / `assigneeName?` / `priorityName?` / `statusName?` / `stateId?` / `expectedCurrentStatusName?` / `comment?` / `dryRun`(默认 true) / 项目定位。
- Service：新增 `triageWorkItem(options)`。组合 = 字段变更(assignee/priority/state) **合并为一次 PATCH** + 可选 `addCommentByWorkItemId`。`expectedCurrentStatusName` 不满足整单拒绝（不部分执行）。
- 输出：`{ dryRun, plan:{ target, fieldChanges, statusChange?, commentToAdd?, expectedSatisfied?, noChange }, executed?:{ updated?, comment?, steps:[{step,ok,error?}] } }`。

## 统一 plan→execute（runMutation）

```ts
private async runMutation<TPlan, TResult>(
  dryRun: boolean,
  build: () => Promise<{ plan: TPlan; noChange: boolean; execute: () => Promise<TResult> }>,
): Promise<{ dryRun: boolean; plan: TPlan; noChange: boolean; executed?: TResult }> {
  const m = await build();                 // ① 永远先算 plan（纯读）
  if (dryRun || m.noChange) return { dryRun, plan: m.plan, noChange: m.noChange };
  assertWritable(this.config);             // ② 写前单点门禁
  const executed = await m.execute();      // ③ 真正写入
  return { dryRun, plan: m.plan, noChange: m.noChange, executed };
}
```

- `update_work_item_fields` / `triage_work_item` 走 `runMutation`。`plan_status_change` 纯只读不进。
- 现有 `updateStatus/updateStatuses/addComment` 暂不重构进 `runMutation`（向后兼容），后续可作低风险 cleanup。

## dryRun / readonly / 幂等 / 审计

- **dryRun 矩阵**：get/search/plan 无 dryRun（纯读）；update_fields/triage 默认 true。现有 status 工具默认值不动（向后兼容）。
- **readonly**：唯一拦截点 `assertWritable`，在 `runMutation` 写前；纯读工具不触发，readonly 环境仍可预览计划。
- **幂等**：`expectedCurrentStatusName` 保护 + 字段无变化跳过；triage 字段+状态合并一次 PATCH。
- **审计（轻量，不引框架）**：把 `plan`（执行前 diff/from-to/payload）与 `executed`（实际结果/steps）直接编码进返回结构，dryRun=true 的 `plan` 即"将发生什么"的审计预览。

## 错误处理与 token 脱敏

- handler 一律走现有 `errorResult`（只回 `error.message`），**禁止** `JSON.stringify(error)` 或回传 `PingCodeApiError.responseText`。
- token / `client_secret` 只从 env 读，不出现在返回结构与日志。
- 可选增强（非本次硬要求）：给 `PingCodeApiError` 加 `toJSON()` 剔除/脱敏 `responseText` 中的 `access_token`/`client_secret`/`Bearer xxx`，防止未来误传。

## 与 Jira 的差异与降级

| Jira 概念 | PingCode 现实 | 本次降级 |
| --- | --- | --- |
| transition + workflow 校验 | 无执行端点，改状态即 PATCH state_id | plan_status_change 只展示，不保证合法性 |
| optimistic lock（version） | 无 version 字段 | expectedCurrentStatusName + 写前比对弱幂等 |
| changelog / history | 端点存在但 schema 未公开/开发中 | 进 P1（须实测），完整变更日志进 Roadmap |
| webhook | Open API 无 webhook 资源 | 进 Roadmap；增量同步用 updated_between 轮询 |
| JQL | 无 | 进 P1（DSL 降级到现有结构化参数） |

## 文件级改动清单（最小 diff）

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `src/tools/schemas.ts` | 新增 | 5 个新工具 zod schema + 共享 `projectScope`/`workItemLocator` 片段 |
| `src/pingcode/types.ts` | 改 | `WorkItemListQuery` 增补可选 `updated_between` |
| `src/pingcode/client.ts` | 改 | 新增 `getWorkItem(workItemId)` |
| `src/pingcode/workItemService.ts` | 改 | 新增 5 方法 + `runMutation` + `resolveWorkItemStrict` + 导出 `detailWorkItem`；现有不动 |
| `src/index.ts` | 改 | 新增 5 个 `registerTool` 块，import 新 schema；现有 13 注册不动 |
| `README.md` | 改 | 工具表 + triage 评论模板 + Roadmap + 降级说明 |
