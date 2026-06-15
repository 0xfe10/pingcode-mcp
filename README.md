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

## 安全策略

- `client_secret` 和 token 只从环境变量读取。
- 返回结果不包含 `client_secret`、token、cookie。
- 导入默认 `dryRun=true`。
- `PINGCODE_READONLY=true` 时禁止创建和更新。
- 批量状态更新默认 `dryRun=true`，并支持当前状态保护。

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
