# Proposal: PingCode MCP 升级为研发日常闭环工作台

## Why

现有 `@succaiss/pingcode-mcp` 已覆盖"拉取列表 / 改状态 / 评论 / 导入"，但停留在**单点动作**，没有形成研发日常闭环：

- **看不全**：只有列表精简字段（`summarizeWorkItem`），拿不到单条工作项的完整描述、图片、父子、创建/更新时间、自定义属性。
- **搜不动**：缺陷与需求分两个工具，无法跨类型统一搜索，也不能按更新时间筛"本周待回归"。
- **改不稳**：除状态外无法安全编辑字段（标题/描述/优先级/负责人/父子）；改状态前没有"只看不改"的计划工具；接单这类组合动作要调多次工具。

对标 Jira 研发闭环常用能力（issue detail、search、edit fields、transition/change plan、triage），pingcode-mcp 存在明显差距。本次把它从"动作集合"升级为"闭环工作台"，让同事用一句自然语言完成接单、改字段、查回归、安全流转。

PingCode 是国产研发管理工具，**不是 Jira**。本提案严格区分"PingCode 真实支持"与"需降级"的能力（见 `design.md` 的 API 核实），不把 Jira 概念硬套。

## What Changes

新增 5 个 P0 工具（全部基于现有 `PingCodeClient` / `WorkItemService` 组装，仅新增 1 个 Client 单条详情方法）：

- `pingcode_get_work_item` — 按编号或工作项 ID 获取单条详情（描述 / 图片 / 可选评论 / 时间 / 父子 / properties）。
- `pingcode_search_work_items` — 统一搜索缺陷与需求，支持关键词、状态、优先级、负责人、更新时间范围、分页。
- `pingcode_plan_status_change` — 只读返回状态变更计划（当前 / 目标 / 可用状态 / 保护条件是否满足），永不执行。
- `pingcode_update_work_item_fields` — 安全编辑字段（标题 / 描述 / 优先级 / 负责人 / 父子 / properties），`dryRun` 默认 true。
- `pingcode_triage_work_item` — 组合分诊（改负责人 + 优先级 + 状态 + 追加评论），`dryRun` 默认 true。

配套工程改动：

- 新增 `src/tools/schemas.ts` 存放新工具的 zod inputSchema（现有 7 个 schema 保持原地，零改动）。
- `PingCodeClient` 新增 `getWorkItem(workItemId)`（对应 `GET /v1/project/work_items/{id}`）。
- `WorkItemService` 新增 5 个 public 方法 + 统一 `runMutation`（plan→execute）骨架 + `resolveWorkItemStrict`，导出 `detailWorkItem`；`summarizeWorkItem` 与现有方法不改。
- `types.ts` 给 `WorkItemListQuery` 增补可选 `updated_between`（服务端确认支持）。
- README 增补新工具表、triage 评论模板、P1/P2 Roadmap、能力降级说明。

## Scope

包含：

- 上述 5 个 P0 工具及其 schema / service / client 改动。
- OpenSpec 文档（proposal / design / tasks / spec delta）。
- README 工具表、示例与 Roadmap。
- 类型检查（`npm run check`）与构建（`npm run build`）验证。

不包含（仅写入 Roadmap，不在本次实现）：

- changelog / 变更历史工具（PingCode `transition_histories`/`activities` 端点存在但响应未文档化，标"开发中"）。
- saved filters、JQL-like 查询 DSL。
- 导出 Markdown / CSV / JSON 工具、图片安全下载工具、AI prompt 模板工具。
- webhook / 增量同步（PingCode Open API 不提供 webhook）、本地 cache、重复缺陷识别、周报生成、权限诊断、audit log 可视化。

非目标：

- 不提交真实 `.env`、token、`client_secret`、cookie。
- 不做 GitLab push / MR。
- 不删除工作项。
- 不引入大型框架。
- 不破坏现有 13 个工具的名称与入参。

## Success Criteria

- `npm run check` 与 `npm run build` 通过。
- 暴露 5 个新工具并出现在 README Tools 表中：`pingcode_get_work_item` / `pingcode_search_work_items` / `pingcode_plan_status_change` / `pingcode_update_work_item_fields` / `pingcode_triage_work_item`。
- 新增写工具（`update_work_item_fields` / `triage_work_item`）`dryRun=true` 时只返回计划，不发任何写请求。
- `PINGCODE_READONLY=true` 时新增写工具拒绝执行；只读工具仍可用。
- 现有 13 个工具名称与入参向后兼容，仍可用。
- 错误输出脱敏，不泄露 token / `client_secret` / 原始响应体。
- P1/P2 能力明确进 Roadmap，未冒充已实现。

## Risks and Mitigations

- **状态流转无工作流校验**：PingCode 无 Jira 式 transition 执行 + 合法性校验端点。`plan_status_change` 只能展示当前 / 目标 / 可用状态，**不保证目标转换被工作流允许**，PATCH 可能被后端拒绝。→ 工具描述与返回中标注该限制；可选 P1 用 `work_item_state_flows` 做客户端预校验。
- **无乐观锁版本号**：PingCode WorkItem 无 version/etag。→ 用 `expectedCurrentStatusName` 做轻量保护 + 写前 GET 比对、字段无变化跳过（弱幂等），并发覆盖风险在工具说明里提示。
- **identifier 与内部 ID 不同**：单条详情端点 path 用内部 `id`。→ 用户给 identifier 时先 `findByIdentifier` 解析 id 再取详情。
- **评论富文本 / 图片下载不确定**：comment `content` 格式未文档化，`public_image_token` 在 Client Credentials 下常为 null。→ 评论按纯文本传入；图片只解析 `imageSources` URL，二进制下载进 Roadmap。
- **错误响应体含敏感信息**：`PingCodeApiError.responseText` 为原始响应体。→ handler 一律走 `errorResult`（只回 message），禁止 `JSON.stringify(error)` 或回传 `responseText`。
- **跨 type 状态/优先级解析差异**：状态按工作项类型不同。→ `search_work_items` 对每个 kind 各自 `getKindSchema` 解析后再合并，不假设单一类型。
