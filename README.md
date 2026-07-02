# PingCode MCP

PingCode MCP 是一个开源（MIT）的 MCP Server，让 Cursor / Claude Code / Codex 等客户端通过自然语言读取和维护 [PingCode](https://pingcode.com) 项目工作项（缺陷 / 需求）。

通过环境变量配置你自己的 PingCode 租户与凭据，示例：

- 租户：`https://<your-domain>.pingcode.com`
- 项目标识：`<PROJECT_KEY>`
- 缺陷视图：`/pjm/projects/<PROJECT_KEY>/defect/<view_id>`
- 需求视图：`/pjm/projects/<PROJECT_KEY>/backlog/<view_id>`

> 文中所有租户、项目标识、人名均为占位示例，请替换为你自己的值。

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
- 在工作项间建立/删除/查看关系（阻塞/被阻塞/重复/关联/依赖等）。
- 个人工作台：聚合当前负责人的缺陷+需求并按状态分组。

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

HTTP / Streamable HTTP 传输（远程 MCP）：

```bash
npm run dev:http
# 或构建后
npm run build
npm run start:http
```

默认监听 `127.0.0.1:3000`，可用 `PINGCODE_MCP_HOST`、`PINGCODE_MCP_PORT` 或 `PORT` 覆盖。健康检查为 `GET /healthz`，MCP 端点为 `GET/POST /mcp`。

远程部署时请放在受信网络、Ingress 鉴权或 API Gateway 之后；本服务包含写入 PingCode 的工具，建议首次上线设置 `PINGCODE_READONLY=true`。监听非 loopback 地址时必须设置 `PINGCODE_MCP_HTTP_TOKEN`，请求 `GET/POST /mcp` 时带上 `Authorization: Bearer <token>`；如确实由外层网关兜底，也可显式设置 `PINGCODE_MCP_ALLOW_UNAUTHENTICATED=true`。

Docker 运行：

```bash
docker build -t pingcode-mcp .
docker run --rm -p 3000:3000 --env-file .env -e PINGCODE_MCP_HTTP_TOKEN=change-me pingcode-mcp
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
# 用户态 OAuth（可选）：配置 Client ID/Secret 后即可用 pingcode_auth_login 浏览器授权
PINGCODE_OAUTH_AUTHORIZE_URL=
PINGCODE_OAUTH_REDIRECT_URI=
PINGCODE_AUTH_TOKEN_PATH=
PINGCODE_PROJECT_IDENTIFIER=PROJECT_KEY
PINGCODE_DEFAULT_ASSIGNEE_NAME=每个人自己的 PingCode 展示名
PINGCODE_BUG_TYPE_ID=bug
PINGCODE_REQUIREMENT_TYPE_ID=
PINGCODE_READONLY=false
```

- `PINGCODE_OAUTH_AUTHORIZE_URL`：浏览器授权地址，缺省为 `${PINGCODE_BASE_URL}/oauth2/authorize`。
- `PINGCODE_OAUTH_REDIRECT_URI`：授权回调地址，须与 PingCode 后台凭据管理里配置的一致。
- `PINGCODE_AUTH_TOKEN_PATH`：用户态 token 存放路径，缺省为 `${XDG_CONFIG_HOME 或 ~/.config}/pingcode-mcp/auth.json`（文件权限 0600）。

推荐使用 PingCode 后台创建的 `Client Credentials` 应用。不要提交真实 `.env`，不要把 `client_secret`、token、cookie 发到聊天里。

`PINGCODE_DEFAULT_ASSIGNEE_NAME` 用于“我的缺陷 / 我的需求”工具。每个同事填自己的 PingCode 展示名，例如 `张三`、`李四`。Client Credentials 是应用身份，不代表当前登录用户，所以这里必须显式配置默认负责人。

PingCode SaaS 的 Open API 地址使用 `https://open.pingcode.com`；私有化部署再按实际地址改成 `https://your-domain/open`。

## 鉴权方式

服务端按以下优先级选择凭据，前一级可用就不再往下走：

1. **用户态 OAuth token**（最高）：`pingcode_auth_login` 浏览器授权后保存在本地 0600 文件里的用户令牌。过期且带 refresh_token 时自动刷新；刷新失败则回退下一级。代表"当前登录用户本人"，`pingcode_get_current_user` / `pingcode_list_my_bugs` / `pingcode_list_my_requirements` 会自动识别你本人，无需手填默认负责人。
2. **`PINGCODE_ACCESS_TOKEN`**：直接配置的官方 Open API access_token。
3. **client_credentials**：用 `PINGCODE_CLIENT_ID` + `PINGCODE_CLIENT_SECRET` 换取的应用身份 token（带进程内缓存）。应用身份没有"当前登录用户"，所以此模式下"我的工作项"需要 `PINGCODE_DEFAULT_ASSIGNEE_NAME`。

## 用户授权（OAuth）

需要先配置 `PINGCODE_CLIENT_ID` / `PINGCODE_CLIENT_SECRET`，并在 PingCode 后台凭据管理里设置好 `redirect_uri`。授权分两步（手动粘贴 code）：

1. 调用 `pingcode_auth_login`（不传 `code`）：返回授权 URL 与引导。

   ```text
   登录 PingCode
   ```

2. 在浏览器打开授权 URL，用本人账号登录授权，从回调地址栏复制 `code`，再次调用并传入：

   ```json
   { "code": "<回调地址里的 code>" }
   ```

   成功后保存用户令牌（本地 0600 文件）并返回当前用户。

辅助工具：

- `pingcode_auth_status`：查看当前鉴权模式（`user` / `env-token` / `application`）、是否已授权、相对过期秒数、当前用户。**不返回任何 token。**
- `pingcode_auth_logout`：清除本地保存的用户态 token。

### 安全说明

- 用户态 token / refresh_token 只写入本地文件，权限 `0600`，进程内缓存仅当前进程可见。
- 服务端**不读取浏览器 cookie / localStorage / sessionStorage**，也**不要把网页登录的 token 贴进聊天**——只用授权回调里的 `code` 换取令牌。
- 任何工具返回值与日志都**不包含 access token / refresh token / client_secret**；`pingcode_auth_status` 只给相对过期秒数。

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
把 PROJ-123 从新提交改成已修复并评论：已修复，待回归
```

如果团队希望所有人共用一个应用凭据，也可以共用 `PINGCODE_CLIENT_ID/SECRET`，但 `PINGCODE_DEFAULT_ASSIGNEE_NAME` 仍然必须每个人单独填写。

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
- `nextStep`：当前缺哪一步（配置凭据 / 配置项目 / 浏览器授权）与下一步可执行动作（含 `pingcode_auth_login` 指令）。
- `mcpClientConfig`：可直接复制的 MCP 客户端配置块（`npmPackage` 与 `localSource` 两种，凭据已打码、本地源码方式自动填好 `dist/index.js` 绝对路径）。粘进客户端配置、填好 Client ID / Client Secret 并重启会话即可使用。

示例追问：

```text
我需要先完成 PingCode MCP 配置。请在聊天框告诉我：
1. PingCode 租户地址，例如 https://xxx.pingcode.com
2. 项目标识，例如 /pjm/projects/PROJ/... 里的 PROJ
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
| `pingcode_get_current_team` | 获取当前企业/团队信息（只读） |
| `pingcode_get_current_user` | 获取当前用户（只读）；应用身份下自动降级为配置的默认负责人 |
| `pingcode_auth_login` | 用户态浏览器授权登录（OAuth）；不传 code 返回授权 URL，传 code 完成登录。不返回 token |
| `pingcode_auth_status` | 查看鉴权状态（user / env-token / application）、是否已授权、相对过期秒数、当前用户。不返回 token |
| `pingcode_auth_logout` | 清除本地保存的用户态 token |
| `pingcode_get_team_members` | 查询企业成员列表（只读），支持关键字 + 部门 ID（≤20）过滤、分页 |
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
| `pingcode_link_work_items` | 在两个工作项间建立关系（阻塞/被阻塞/重复/关联/依赖等），默认 dry-run |
| `pingcode_unlink_work_items` | 按 relationId 删除工作项的某条关系（relationId 来自列关系工具），默认 dry-run |
| `pingcode_list_work_item_relations` | 列出工作项的全部关系（可按 relationType 过滤），返回每条关系的 id 与目标 |
| `pingcode_get_my_work` | 聚合当前负责人的缺陷+需求并按状态分组（每组带计数、按 ID 去重），只读 |

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
  "identifiers": ["PROJ-505", "PROJ-503"],
  "dryRun": true
}
```

确认计划无误后再执行：

```json
{
  "identifiers": ["PROJ-505", "PROJ-503"],
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
  "identifier": "PROJ-505",
  "content": "已修复，待回归验证。",
  "dryRun": true
}
```

确认后再执行：

```json
{
  "kind": "bug",
  "identifier": "PROJ-505",
  "content": "已修复，待回归验证。",
  "dryRun": false
}
```

PingCode 评论资源使用 `principal_type=work_item` 和工作项 ID 绑定。若 `Client Credentials` 写评论返回权限不足，需要在 PingCode 后台确认评论写入权限，或改用支持用户身份的授权方式。

## 闭环工作台用法

新增 5 个工具把 pingcode-mcp 从"动作集合"升级为"研发日常闭环"。所有写工具默认 `dryRun=true`：AI 先回计划，确认后再带 `dryRun:false` 执行。

### 看详情

```text
看一下 PROJ-455 的详情，把评论也带上
```

对应 `pingcode_get_work_item`（`includeComments=true`），返回完整描述、图片地址、创建/更新时间、父项、自定义属性与评论。

### 统一搜索

```text
搜本周更新过的、状态是已修复的缺陷和需求
```

对应 `pingcode_search_work_items`，一次跨缺陷+需求搜索，支持 `stateNames` / `priorityNames` / `assigneeNames` / `keywords` / `updatedAfter` / `updatedBefore` / 分页。`updatedAfter` / `updatedBefore` 映射为 PingCode 服务端 `updated_between` 过滤。结果按工作项 `id` 去重。

#### raw 过滤（精确按 ID）

当已知确切 ID 时，可在统一搜索里直接传 raw 过滤，与按名称过滤可同时使用：

- **ID 列表（数组，每个字段 ≤20）**：`projectIds` / `typeIds` / `parentIds` / `assigneeIds` / `stateIds` / `priorityIds` / `tagIds` / `sprintIds` / `boardIds` / `entryIds` / `swimlaneIds` / `phaseIds` / `versionIds` / `createdByIds`。其中 `projectIds` / `typeIds` / `stateIds` / `priorityIds` / `assigneeIds` 会与对应的 name 解析结果合并、去重，并截断到 ≤20。
- **单值**：`participantId`（参与人）。
- **时间范围**：`createdBetween` / `startBetween` / `endBetween`，格式为秒级时间戳 `起,止`，支持单边，如 `1700000000,` 或 `,1700000000`。
- **布尔**：`includeDeleted` / `includeArchived`，默认 `false`。

示例：

```json
{
  "kinds": ["bug"],
  "assigneeNames": ["张三"],
  "sprintIds": ["6xxxxxxxxxxxxxxxxxxxxxxx"],
  "createdBetween": "1717200000,1717804800"
}
```

自然语言示例：

```text
查张三名下、某个迭代里、本周创建的缺陷
看技术部有哪些成员
当前连的是哪个企业
```

- 「查张三名下、某迭代、本周创建的缺陷」→ `pingcode_search_work_items`（`assigneeNames` + `sprintIds` + `createdBetween`）。
- 「看技术部有哪些成员」→ `pingcode_get_team_members`（`keywords` 或 `departmentIds`）。
- 「当前连的是哪个企业」→ `pingcode_get_current_team`。

### 先看流转计划再改

```text
PROJ-455 想改成已验收，先给我看会发生什么
```

对应 `pingcode_plan_status_change`，**只读**返回当前状态、目标状态、该类型可用状态列表、`expectedCurrentStatusName` 是否满足。确认后再走写工具。

### 安全编辑字段

先 dry-run：

```json
{ "identifier": "PROJ-455", "priorityName": "最高", "assigneeName": "张三", "dryRun": true }
```

对应 `pingcode_update_work_item_fields`，返回字段级 diff（仅变化的字段进入 PATCH）。确认后传 `dryRun:false`。字段无变化时 `noChange=true` 自动跳过写入；`expectedCurrentStatusName` 不匹配则拒绝。

### 一句话分诊（triage）

```json
{ "identifier": "PROJ-455", "assigneeName": "张三", "statusName": "处理中", "expectedCurrentStatusName": "新提交", "comment": "【接单】已接手处理，开始排查。", "dryRun": true }
```

对应 `pingcode_triage_work_item`，把改负责人 + 改优先级 + 改状态合并为一次 PATCH，再追加评论。`expectedCurrentStatusName` 不匹配则整单拒绝、不部分执行。

### 单条创建

```text
新建一个 bug：登录页验证码不刷新，优先级最高，指派给张三
```

对应 `pingcode_create_work_item`，按标题（必填）+ 描述/优先级/负责人/父项/属性创建一条缺陷或需求。`dryRun=true`（默认）只回创建计划；确认后传 `dryRun:false` 落库，返回新工作项编号。`statusName` 建议不传，由 PingCode 用类型默认初始态，避免初始状态被工作流校验拒绝。

### 原生批量更新

```text
把 PROJ-505 PROJ-503 PROJ-501 批量改成已修复，只动当前还是处理中的
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

## 关系 / 依赖

在工作项之间建立、删除、查看关系（阻塞 / 被阻塞 / 重复 / 关联 / 因果 / 克隆 / 依赖等）。

### 方向语义

关系记录在「源工作项」上，方向以源 → 目标理解：

- `block`：源 **阻塞** 目标（目标要等源完成）。
- `blocked_by`：源 **被** 目标阻塞。
- `cause` / `caused_by`：源 **引发** 目标 / 源 **由** 目标引发。
- `clone` / `cloned_by`：源 **克隆出** 目标 / 源 **是** 目标的克隆。
- `relate`：双向关联。`duplicate`：源与目标重复。`dependency`：依赖。`mention`：提及。

### relationType 取值

- **系统枚举**（直接填）：`block` / `blocked_by` / `relate` / `duplicate` / `cause` / `caused_by` / `clone` / `cloned_by` / `dependency` / `mention`。
- **自定义关系类型**：可直接填关系类型的名称或 ID，工具会调用 `/relation_types` 端点按 id / name / category 解析为 ID；解析失败时回退原值，交给服务端校验。

### 建立关系（link）

`pingcode_link_work_items` 默认 `dryRun=true`，先回计划，确认后传 `dryRun:false` 才真正创建。

先 dry-run：

```json
{ "identifier": "PROJ-1", "targetIdentifier": "PROJ-2", "relationType": "block", "dryRun": true }
```

确认后执行（表示 PROJ-1 阻塞 PROJ-2）：

```json
{ "identifier": "PROJ-1", "targetIdentifier": "PROJ-2", "relationType": "block", "dryRun": false }
```

源工作项用 `identifier` 或 `workItemId` 定位；目标用 `targetIdentifier` 或 `targetWorkItemId`，两者都解析不到目标时报「未找到目标工作项」。

### 列出关系（list）

`pingcode_list_work_item_relations` 只读，返回每条关系的 `id`（删除时需要）与目标工作项，可按 `relationType` 过滤。

```json
{ "identifier": "PROJ-1" }
```

### 删除关系（unlink）

删除前必须先用「列出关系」拿到目标关系的 `relationId`。`pingcode_unlink_work_items` 默认 `dryRun=true`。

```json
{ "identifier": "PROJ-1", "relationId": "<来自 list 的关系 id>", "dryRun": false }
```

## 个人工作台

`pingcode_get_my_work` 只读：把当前负责人名下的缺陷与需求聚合起来，按状态分组返回，每组带计数，跨缺陷/需求按工作项 ID 去重。

- 负责人优先用入参 `assigneeName`，缺省则回退 `PINGCODE_DEFAULT_ASSIGNEE_NAME`，两者都没有时报错。
- `kinds` 默认 `["bug","requirement"]`；可加 `stateNames` / `updatedAfter` / `updatedBefore` / `pageSize` 过滤。
- 返回结构：`{ assigneeName, total, groups: [{ status, count, items }] }`，无状态名的归入 `未分组`。

自然语言示例：

```text
看我手上的活按状态分组
把 PROJ-1 标记为阻塞 PROJ-2
列出 PROJ-1 的所有关系
```

- 「看我手上的活按状态分组」→ `pingcode_get_my_work`。
- 「把 PROJ-1 标记为阻塞 PROJ-2」→ `pingcode_link_work_items`（`relationType=block`，先 dry-run 再 `dryRun:false`）。
- 「列出 PROJ-1 的所有关系」→ `pingcode_list_work_item_relations`。

## Roadmap

以下能力尚未实现，仅作规划，欢迎按需推进。

### P1

- changelog / 变更历史工具（PingCode `transition_histories` 仅状态流转、`activities` 标"开发中"，响应字段未文档化，需实测后再做）。
- saved filters（本地保存常用搜索条件，如"我的待回归"）。
- JQL-like 查询 DSL（降级到现有结构化参数）。
- 导出 Markdown / CSV / JSON 工具。
- 图片安全下载工具（受控目录/大小，过滤外链）。
- AI prompt 模板工具（评论/周报/triage）。
- 迭代/版本/标签/关注人、附件上下传（PingCode 均有原生 API，待按需实现）。

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
- 新增写工具 `pingcode_update_work_item_fields` / `pingcode_triage_work_item` / `pingcode_link_work_items` / `pingcode_unlink_work_items` 默认 `dryRun=true`，写前统一经过 `assertWritable`，`PINGCODE_READONLY=true` 时拒绝。
- 错误只返回 message，不回传 PingCode 原始响应体、token 或 `client_secret`。

## 发布说明（mcp.so / npm）

发布到 mcp.so 或 npm 时只发布通用说明与占位示例，**不要**写入任何真实租户地址、Client Secret、access token、cookie 或私有部署细节。

英文简介（可用于 mcp.so）：

```text
PingCode MCP server for project work items. List/search bugs and requirements, view item detail and images, create and edit items, plan/triage status changes (with workflow pre-check), native bulk updates, manage relations, comments, a personal work queue, and directory lookups. Supports client-credentials, access-token, and user-mode OAuth (browser login) — configured per user via environment variables.
```

## 贡献与开发

```bash
npm install
npm run check   # 类型检查
npm run build   # 构建到 dist/
npm test        # 运行测试（node:test）
```

欢迎提 Issue / PR。请勿在 Issue、PR、提交或日志中粘贴任何真实凭据。

## License

[MIT](./LICENSE) © succAIss
