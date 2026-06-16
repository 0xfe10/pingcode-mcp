# Proposal: PingCode 工作项 MCP 接入

## Why

前端、后端、AI 项目仓库分散，团队需要一个独立 MCP 工具，让同事可以在 Cursor / Claude Code / Codex 等客户端中统一读取和维护 PingCode 缺陷与需求清单。

当前用户提供的 PingCode 项目为 `示例项目`，项目标识为 `<PROJECT_KEY>`：

- 缺陷视图：`/pjm/projects/<PROJECT_KEY>/defect/<view_id>`
- 需求视图：`/pjm/projects/<PROJECT_KEY>/backlog/<view_id>`

这两类数据都可按 PingCode 项目管理工作项处理。MCP 应基于既有 PingCode REST API 封装，不把公司 token、租户地址或仓库凭据硬编码进源码。

## What Changes

- 新增独立 TypeScript MCP server 包 `@succaiss/pingcode-mcp`。
- 使用 stdio transport，支持本地 AI 客户端按环境变量接入。
- 封装 PingCode 工作项 API：
  - 获取项目、工作项类型、状态、优先级、成员。
  - 拉取缺陷列表与需求列表。
  - 从 `.xlsx` / `.csv` 导入缺陷表与需求清单。
  - 修改缺陷或需求状态。
  - 先 dry-run 校验导入计划，再允许执行写入。
- 提供 `.env.example`、README、示例 CSV，方便同事复制配置。

## Scope

包含：

- MCP server 入口与工具注册。
- PingCode REST client。
- 缺陷/需求工作项字段映射。
- `.xlsx` / `.csv` 表格解析。
- OpenSpec 文档与任务拆分。

不包含：

- 真实 token 或公司凭据。
- GitLab push / MR。
- PingCode 后台配置修改。
- 删除工作项。
- 远程托管型 MCP 服务。

## Success Criteria

- `npm install` 后 `npm run build` 通过。
- MCP server 暴露以下 tools：
  - `pingcode_get_project_schema`
  - `pingcode_list_bugs`
  - `pingcode_list_requirements`
  - `pingcode_import_bugs`
  - `pingcode_import_requirements`
  - `pingcode_update_bug_status`
  - `pingcode_update_requirement_status`
- README 提供 Cursor / Claude Code / Codex 配置示例。
- 所有写操作支持 dry-run 或只允许单项明确更新。
- 不提交 `.env`，不在日志和返回里泄露 token。

## Risks and Mitigations

- **登录令牌过期**：所有请求返回 PingCode 原始状态码与错误消息，提示用户刷新本地环境变量。
- **状态 ID 不稳定**：通过状态名称动态解析 ID，支持显式传 `stateId`。
- **导入误写**：导入默认 `dryRun=true`，执行时限制单次最大行数。
- **不同项目类型字段差异**：保留 `properties` 扩展字段，未识别列不会丢失，会写入 `extraColumns` 供用户检查。
- **公开 mcp.so 泄露内部信息**：mcp.so 只发布通用介绍，不发布公司域名、GitLab 地址或 token。
