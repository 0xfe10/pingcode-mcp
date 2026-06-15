# Changelog

本文件记录 `@succaiss/pingcode-mcp` 的版本变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0]

### Added

- **用户态 OAuth 登录**：`pingcode_auth_login` / `pingcode_auth_status` / `pingcode_auth_logout`，支持浏览器授权码换取用户令牌，令牌以 0600 权限本地持久化；以本人身份调用，无需手填默认负责人。
- **目录与组织查询**：`pingcode_get_current_team` / `pingcode_get_current_user` / `pingcode_get_team_members`。
- **工作项搜索与详情**：`pingcode_search_work_items`（跨缺陷/需求聚合）、`pingcode_get_work_item`（富字段详情，可含评论/图片）。
- **原生过滤维度**：搜索/列表支持 raw id 过滤（tag/sprint/board/entry/swimlane/phase/version/created_by 等），名称解析与 raw id 合并去重。
- **创建 / 批量 / 流转预检**：`pingcode_create_work_item`、`pingcode_bulk_update_work_items`、`pingcode_plan_status_change`、`pingcode_update_work_item_fields`、`pingcode_triage_work_item`，写操作统一 dryRun 预检 + readonly 拦截。
- **关系与个人工作台**：`pingcode_link_work_items` / `pingcode_unlink_work_items` / `pingcode_list_work_item_relations`、`pingcode_get_my_work`（按状态分组）。
- **配置增强**：`pingcode_check_setup` 输出鉴权模式、下一步引导、可复制 MCP 配置（凭据打码）。

### Hardened

- **自动化测试**：基于 Node 内置 `node:test`（零第三方依赖，`npm test`）覆盖鉴权优先级与刷新、401 重试、dry-run 不写、readonly 拒写、搜索合并去重与截断、个人工作台分组、token 文件 0600 权限、配置脱敏。
- **401 自动重试**：业务请求返回 401 时尝试单次重新鉴权（用户态强制刷新令牌，否则失效 client_credentials 缓存）并重试一次；token 端点自身不参与重试，防止循环。
- **结果截断提示**：`pingcode_search_work_items` / `pingcode_get_my_work` 在结果超过一页时返回 `truncated` 标记与 per-kind `hasMore` 及中文翻页提示，不再静默丢弃。
- **错误脱敏**：`PingCodeApiError.toJSON` 仅输出 name/message/status（不含原始响应体）；新增 `PingCodeApiError.mask` 对 access_token/refresh_token/client_secret/code 与 Bearer 令牌打码。

## [0.1.0]

### Added

- 首个版本，提供 13 个核心工具：
  - `pingcode_check_setup`
  - `pingcode_get_project_schema`
  - `pingcode_list_bugs`
  - `pingcode_list_requirements`
  - `pingcode_list_my_bugs`
  - `pingcode_list_my_requirements`
  - `pingcode_update_bug_status`
  - `pingcode_update_requirement_status`
  - `pingcode_mark_bugs_fixed`
  - `pingcode_add_work_item_comment`
  - `pingcode_list_work_item_comments`
  - `pingcode_import_bugs`
  - `pingcode_import_requirements`
