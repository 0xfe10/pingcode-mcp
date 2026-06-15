# PingCode MCP

PingCode MCP 是一个公司内部可复用的 MCP Server，用于让 Cursor / Claude Code / Codex 等客户端通过自然语言读取和维护 PingCode 项目工作项。

你的项目可以通过环境变量配置。按当前需求，内部使用时可填：

- 租户：`https://<your-domain>.pingcode.com`
- 项目标识：`<PROJECT_KEY>`
- 缺陷视图：`/pjm/projects/<PROJECT_KEY>/defect/<view_id>`
- 需求视图：`/pjm/projects/<PROJECT_KEY>/backlog/<view_id>`

## 能力

- 拉取缺陷列表。
- 拉取需求清单。
- 按当前使用者默认负责人拉取“我的缺陷 / 我的需求”。
- 解析富文本描述中的图片数量和图片源地址。
- 从 `.xlsx` / `.csv` 导入缺陷。
- 从 `.xlsx` / `.csv` 导入需求。
- 修改单个缺陷状态。
- 修复后批量把缺陷从 `新提交` 标记为 `已修复`。
- 给缺陷/需求追加评论，或在标记已修复时顺带评论。
- 修改单个需求状态。
- 查询项目 schema：工作项类型、状态、优先级、成员。
- 获取单条工作项完整详情（描述/图片/时间/父项/属性/可选评论）。
- 统一搜索缺陷+需求（状态/优先级/负责人/关键词/更新时间范围/分页）。
- 只读预览状态变更计划（基于工作流预检合法流转）；安全编辑字段；一句话分诊（triage）。
- 单条创建缺陷/需求；按编号原生批量改优先级/负责人/状态。

## 安装

```bash
npm install
npm run build
```

本地开发：

```bash
npm run dev
```

构建后运行：

```bash
npm start
```

## 环境变量

复制 `.env.example` 为 `.env`，或者在 MCP 客户端配置里设置 env。

```bash
PINGCODE_BASE_URL=https://your-domain.pingcode.com
PINGCODE_API_BASE_URL=https://open.pingcode.com
PINGCODE_CLIENT_ID=每个人自己的 Client ID
PINGCODE_CLIENT_SECRET=每个人自己的 Client Secret
# 也可以直接填官方 Open API access_token，二选一即可
PINGCODE_ACCESS_TOKEN=
PINGCODE_AUTH_SCHEME=Bearer
PINGCODE_PROJECT_IDENTIFIER=PROJECT_KEY
PINGCODE_DEFAULT_ASSIGNEE_NAME=每个人自己的 PingCode 展示名
PINGCODE_BUG_TYPE_ID=bug
PINGCODE_REQUIREMENT_TYPE_ID=
PINGCODE_READONLY=false
```

推荐使用 PingCode 后台创建的 `Client Credentials` 应用。不要提交真实 `.env`，不要把 `client_secret`、token、cookie 发到聊天里。

`PINGCODE_DEFAULT_ASSIGNEE_NAME` 用于“我的缺陷 / 我的需求”工具。每个同事填自己的 PingCode 展示名，例如 `张夏`、`林勇坚`。Client Credentials 是应用身份，不代表当前登录用户，所以这里必须显式配置默认负责人。

PingCode SaaS 的 Open API 地址使用 `https://open.pingcode.com`；私有化部署再按实际地址改成 `https://your-domain/open`。

## 团队使用方式

每个同事本地配置同一个 MCP Server，但使用自己的环境变量：

```json
{
  "PINGCODE_CLIENT_ID": "同事自己的 Client ID",
  "PINGCODE_CLIENT_SECRET": "同事自己的 Client Secret",
  "PINGCODE_DEFAULT_ASSIGNEE_NAME": "同事自己的 PingCode 展示名"
}
```

配置后可以直接问：

```text
拉取我的新提交缺陷
拉取我的进行中需求
把 MYM-123 从新提交改成已修复并评论：已修复，待回归
```

如果公司希望所有人共用一个应用凭据，也可以共用 `PINGCODE_CLIENT_ID/SECRET`，但 `PINGCODE_DEFAULT_ASSIGNEE_NAME` 仍然必须每个人单独填写。

### 首次使用引导

当同事第一次使用或配置不完整时，让 AI 先调用：

```text
检查 PingCode MCP 配置
```

对应工具是 `pingcode_check_setup`。它会返回：

- 缺哪些环境变量。
- 哪些信息可以直接在聊天框填写。
- 哪些是敏感信息，只能填到本地 MCP env。
- 每个信息在 PingCode 哪里找。
- 可复制的 env 模板。

示例追问：

```text
我需要先完成 PingCode MCP 配置。请在聊天框告诉我：
1. PingCode 租户地址，例如 https://xxx.pingcode.com
2. 项目标识，例如 /pjm/projects/MYM/... 里的 MYM
3. 你的 PingCode 展示名，也就是负责人列显示的名字

Client ID / Client Secret 请去 PingCode 右上角头像 -> 管理后台 -> 凭据管理/凭证管理 -> 应用里查看，并填到本地 MCP env，不要发到公共聊天。
```

## MCP 客户端配置

### 使用本地源码

```json
{
  "mcpServers": {
    "pingcode": {
      "command": "node",
      "args": ["/ABSOLUTE_PATH/pingcode-mcp/dist/index.js"],
      "env": {
        "PINGCODE_BASE_URL": "https://your-domain.pingcode.com",
        "PINGCODE_API_BASE_URL": "https://open.pingcode.com",
        "PINGCODE_CLIENT_ID": "每个人自己的 Client ID",
        "PINGCODE_CLIENT_SECRET": "每个人自己的 Client Secret",
        "PINGCODE_PROJECT_IDENTIFIER": "PROJECT_KEY",
        "PINGCODE_DEFAULT_ASSIGNEE_NAME": "每个人自己的 PingCode 展示名"
      }
    }
  }
}
```

### 发布 npm 包后

```json
{
  "mcpServers": {
    "pingcode": {
      "command": "npx",
      "args": ["-y", "@succaiss/pingcode-mcp"],
      "env": {
        "PINGCODE_BASE_URL": "https://your-domain.pingcode.com",
        "PINGCODE_API_BASE_URL": "https://open.pingcode.com",
        "PINGCODE_CLIENT_ID": "每个人自己的 Client ID",
        "PINGCODE_CLIENT_SECRET": "每个人自己的 Client Secret",
        "PINGCODE_PROJECT_IDENTIFIER": "PROJECT_KEY",
        "PINGCODE_DEFAULT_ASSIGNEE_NAME": "每个人自己的 PingCode 展示名"
      }
    }
  }
}
```

## Tools

| Tool | 说明 |
| --- | --- |
| `pingcode_check_setup` | 检查配置并返回聊天框追问清单、信息查找位置、env 模板 |
| `pingcode_get_project_schema` | 获取项目、类型、状态、优先级、成员 |
| `pingcode_list_bugs` | 拉取缺陷列表 |
| `pingcode_list_requirements` | 拉取需求清单 |
| `pingcode_list_my_bugs` | 按 `PINGCODE_DEFAULT_ASSIGNEE_NAME` 拉取我的缺陷 |
| `pingcode_list_my_requirements` | 按 `PINGCODE_DEFAULT_ASSIGNEE_NAME` 拉取我的需求 |
| `pingcode_import_bugs` | 导入缺陷表，默认 dry-run |
| `pingcode_import_requirements` | 导入需求表，默认 dry-run |
| `pingcode_update_bug_status` | 修改单个缺陷状态 |
| `pingcode_mark_bugs_fixed` | 修复后批量把缺陷从 `新提交` 标记为 `已修复`，默认 dry-run |
| `pingcode_add_work_item_comment` | 给缺陷/需求追加评论，默认 dry-run |
| `pingcode_list_work_item_comments` | 获取缺陷/需求评论列表 |
| `pingcode_update_requirement_status` | 修改单个需求状态 |
| `pingcode_get_work_item` | 按编号或工作项 ID 获取单条详情（描述/图片/时间/父项/属性，可选评论） |
| `pingcode_search_work_items` | 统一搜索缺陷+需求，支持状态/优先级/负责人/关键词/更新时间范围/分页 |
| `pingcode_plan_status_change` | 只读返回状态变更计划（当前/目标/可用状态/保护条件），永不执行 |
| `pingcode_update_work_item_fields` | 安全编辑字段（标题/描述/优先级/负责人/父项/属性），默认 dry-run |
| `pingcode_triage_work_item` | 组合分诊：改负责人+优先级+状态+评论，默认 dry-run |
| `pingcode_create_work_item` | 单条创建缺陷/需求（标题必填 + 描述/优先级/负责人/父项/属性），默认 dry-run |
| `pingcode_bulk_update_work_items` | 按编号批量改优先级/负责人/状态（原生 bulk，≤100，planned/skipped/failed），默认 dry-run |

## 表格模板

缺陷表字段：

```text
编号, 标题, 状态, 优先级, 负责人, 父工作项, 描述
```

需求表字段：

```text
编号, 标题, 状态, 负责人, 优先级, 父工作项, 需求类型, 创建时间, 描述
```

示例文件在 `examples/` 目录。

## 富文本图片

`pingcode_list_bugs` / `pingcode_list_requirements` 会返回 `imageCount` 和 `imageSources`，用于识别详情描述里的图片。

图片二进制下载需要 PingCode 的 `public_image_token`。SaaS Open API 可通过 `includePublicImageToken=true` 请求该字段，但在部分 `Client Credentials` 场景下 PingCode 可能返回 `null`。这种情况下需要使用已登录用户态页面生成的临时图片 token 下载，且不要把 token 写入表格、日志或聊天。

## 修复后变更状态

修完 bug 后推荐使用 `pingcode_mark_bugs_fixed`，默认只处理当前状态仍为 `新提交` 的缺陷，并把目标状态设为 `已修复`。

先 dry-run：

```json
{
  "identifiers": ["MYM-505", "MYM-503"],
  "dryRun": true
}
```

确认计划无误后再执行：

```json
{
  "identifiers": ["MYM-505", "MYM-503"],
  "comment": "已修复，相关改动已提交，待回归验证。",
  "dryRun": false
}
```

如果某条缺陷已经不是 `新提交`，工具会跳过并返回 skipped，避免覆盖同事已经处理过的状态。

## 评论

单独追加评论时，先 dry-run：

```json
{
  "kind": "bug",
  "identifier": "MYM-505",
  "content": "已修复，待回归验证。",
  "dryRun": true
}
```

确认后再执行：

```json
{
  "kind": "bug",
  "identifier": "MYM-505",
  "content": "已修复，待回归验证。",
  "dryRun": false
}
```

PingCode 评论资源使用 `principal_type=work_item` 和工作项 ID 绑定。若 `Client Credentials` 写评论返回权限不足，需要在 PingCode 后台确认评论写入权限，或改用支持用户身份的授权方式。

## 闭环工作台用法

新增 5 个工具把 pingcode-mcp 从"动作集合"升级为"研发日常闭环"。所有写工具默认 `dryRun=true`：AI 先回计划，确认后再带 `dryRun:false` 执行。

### 看详情

```text
看一下 MYM-455 的详情，把评论也带上
```

对应 `pingcode_get_work_item`（`includeComments=true`），返回完整描述、图片地址、创建/更新时间、父项、自定义属性与评论。

### 统一搜索

```text
搜本周更新过的、状态是已修复的缺陷和需求
```

对应 `pingcode_search_work_items`，一次跨缺陷+需求搜索，支持 `stateNames` / `priorityNames` / `assigneeNames` / `keywords` / `updatedAfter` / `updatedBefore` / 分页。`updatedAfter` / `updatedBefore` 映射为 PingCode 服务端 `updated_between` 过滤。

### 先看流转计划再改

```text
MYM-455 想改成已验收，先给我看会发生什么
```

对应 `pingcode_plan_status_change`，**只读**返回当前状态、目标状态、该类型可用状态列表、`expectedCurrentStatusName` 是否满足。确认后再走写工具。

### 安全编辑字段

先 dry-run：

```json
{ "identifier": "MYM-455", "priorityName": "最高", "assigneeName": "张夏", "dryRun": true }
```

对应 `pingcode_update_work_item_fields`，返回字段级 diff（仅变化的字段进入 PATCH）。确认后传 `dryRun:false`。字段无变化时 `noChange=true` 自动跳过写入；`expectedCurrentStatusName` 不匹配则拒绝。

### 一句话分诊（triage）

```json
{ "identifier": "MYM-455", "assigneeName": "张夏", "statusName": "处理中", "expectedCurrentStatusName": "新提交", "comment": "【接单】已接手处理，开始排查。", "dryRun": true }
```

对应 `pingcode_triage_work_item`，把改负责人 + 改优先级 + 改状态合并为一次 PATCH，再追加评论。`expectedCurrentStatusName` 不匹配则整单拒绝、不部分执行。

### 单条创建

```text
新建一个 bug：登录页验证码不刷新，优先级最高，指派给张夏
```

对应 `pingcode_create_work_item`，按标题（必填）+ 描述/优先级/负责人/父项/属性创建一条缺陷或需求。`dryRun=true`（默认）只回创建计划；确认后传 `dryRun:false` 落库，返回新工作项编号。`statusName` 建议不传，由 PingCode 用类型默认初始态，避免初始状态被工作流校验拒绝。

### 原生批量更新

```text
把 MYM-505 MYM-503 MYM-501 批量改成已修复，只动当前还是处理中的
```

对应 `pingcode_bulk_update_work_items`，用 PingCode 原生 bulk 端点（单次 ≤100）批量改优先级/负责人/状态。沿用 `planned/skipped/failed` 模式，`expectedCurrentStatusName` 不匹配的条目自动跳过，防止覆盖同事改动。`dryRun=true`（默认）只回计划；每个变更字段执行时各发一次 bulk 请求。

### 状态流转预检（已升级）

`pingcode_plan_status_change` 现在会基于 PingCode 工作流（`work_item_state_plans` + `work_item_state_flows`）返回 `allowedTransitions`（当前状态可合法流转到的目标）与 `transitionAllowed`（请求的目标是否被允许）。解析不到状态方案时回退为列出全部状态，并在 `note` 标注未能预检。本工具仍为只读。

## triage 评论模板

供 `comment` 字段直接复制，`{}` 为占位变量，按上下文填充：

| 动作 | 模板 |
| --- | --- |
| 接单（→ 处理中） | `【接单】已接手处理，开始排查。当前优先级：{优先级}。预计跟进方向：{初步判断}。` |
| 处理中（开始定位） | `【处理中】已复现（环境：{环境}）。初步定位：{根因方向}。后续将{修复方案}。` |
| 修复待回归（→ 已修复） | `【待回归】已修复并自测通过。根因：{根因}。改动点：{涉及模块/提交}。验证方式：{回归步骤}。请 QA 回归。` |
| 需求进入开发（→ 开发中） | `【进入开发】需求已认领并启动开发。技术方案：{方案要点}。预计提测节点：{节点}。` |
| 回归打回（→ 处理中） | `【打回】回归未通过。环境：{环境}。问题表现：{现象}。已退回处理中，请重新跟进。` |

## Roadmap

以下能力尚未实现，仅作规划，欢迎按需推进。

### P1

- changelog / 变更历史工具（PingCode `transition_histories` 仅状态流转、`activities` 标"开发中"，响应字段未文档化，需实测后再做）。
- saved filters（本地保存常用搜索条件，如"我的待回归"）。
- JQL-like 查询 DSL（降级到现有结构化参数）。
- 导出 Markdown / CSV / JSON 工具。
- 图片安全下载工具（受控目录/大小，过滤外链）。
- AI prompt 模板工具（评论/周报/triage）。
- 关系/依赖（blocks/duplicates/relates）、个人统一工作台、迭代/版本/标签/关注人、附件上下传（PingCode 均有原生 API，待按需实现）。

### P2

- webhook / 增量同步（PingCode Open API **不提供 webhook**，只能用 `updated_between` 轮询游标降级实现）。
- 本地 cache（缓存 schema：类型/状态/优先级/成员，TTL 失效）。
- 重复缺陷识别。
- 周报生成。
- 权限诊断（探测当前 token 对写操作的实际权限）。
- MCP audit log 可视化。

## 能力边界与降级说明

不要把 Jira 的概念硬套到 PingCode：

- **状态流转无工作流校验**：PingCode 没有 Jira 式 transition 执行 + 合法性校验端点。`pingcode_plan_status_change` 只能展示当前/目标/可用状态，**不保证目标转换被工作流允许**，实际 PATCH 可能被后端拒绝。
- **无乐观锁版本号**：PingCode 工作项无 version/etag。本工具用 `expectedCurrentStatusName` + 写前比对（字段无变化跳过）做弱幂等，并发覆盖风险无法从 API 层根治。
- **identifier 与内部 ID 不同**：单条详情端点按内部 ID 寻址；传 identifier 时会先解析为内部 ID 再取详情。
- **评论富文本/图片**：评论 `content` 格式未文档化，建议按纯文本传入；`public_image_token` 在 Client Credentials 下常返回 null，图片只解析 `imageSources` URL，二进制下载进 Roadmap。

## 安全策略

- `client_secret` 和 token 只从环境变量读取。
- 返回结果不包含 `client_secret`、token、cookie。
- 导入默认 `dryRun=true`。
- `PINGCODE_READONLY=true` 时禁止创建和更新。
- 批量状态更新默认 `dryRun=true`，并支持当前状态保护。
- 新增写工具 `pingcode_update_work_item_fields` / `pingcode_triage_work_item` 默认 `dryRun=true`，写前统一经过 `assertWritable`，`PINGCODE_READONLY=true` 时拒绝。
- 错误只返回 message，不回传 PingCode 原始响应体、token 或 `client_secret`。

## 发布到 mcp.so

mcp.so 只发布通用说明，不要发布公司内网 GitLab、租户地址、token。

建议描述：

```text
PingCode MCP server for project work items. It supports listing bugs and requirements, importing .xlsx/.csv work item tables, resolving project schema, and updating work item status. Users configure their own PingCode base URL and Client Credentials or official access token through environment variables.
```

## GitLab 建议

建议使用独立仓库，而不是放在前端仓库：

```text
http://<gitlab-host>/<group>/pingcode-mcp.git
```

前端仓库 `front_end/antview-frontend.git` 可以在 README 中引用这个 MCP，但不建议承载 MCP 源码。
