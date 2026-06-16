# Design: PingCode 工作项 MCP 接入

## Architecture

```text
AI Client
  -> stdio MCP server
    -> tool handlers
      -> import parser
      -> PingCode client
        -> /open/v1/project/*
```

## API Mapping

| Capability | PingCode API |
| --- | --- |
| Resolve project | `GET /v1/project/projects?identifier=PROJ` |
| Work item types | `GET /v1/project/work_item/types?project_id=...` |
| States | `GET /v1/project/work_item/states?project_id=...&work_item_type_id=...` |
| Priorities | `GET /v1/project/work_item/priorities?project_id=...` |
| Members | `GET /v1/project/projects/{project_id}/members` |
| List work items | `GET /v1/project/work_items` |
| Create work item | `POST /v1/project/work_items` |
| Update work item | `PATCH /v1/project/work_items/{work_item_id}` |

## Work Item Type Resolution

- Bug defaults to `PINGCODE_BUG_TYPE_ID` or type names `缺陷` / `bug`.
- Requirement defaults to `PINGCODE_REQUIREMENT_TYPE_ID` or type names `需求` / `用户故事` / `story`.
- If no match is found, `pingcode_get_project_schema` exposes available type names and IDs.

## Spreadsheet Mapping

### Defect table

| Column | Target |
| --- | --- |
| 编号 | existing work item identifier |
| 标题 | `title` |
| 状态 | `state_id` by name |
| 优先级 | `priority_id` by name |
| 负责人 | `assignee_id` by member display name/name |
| 父工作项 | `parent_id` by identifier/id |
| 描述 | `description` |

### Requirement table

| Column | Target |
| --- | --- |
| 编号 | existing work item identifier |
| 标题 | `title` |
| 状态 | `state_id` by name |
| 负责人 | `assignee_id` |
| 优先级 | `priority_id` |
| 父工作项 | `parent_id` |
| 需求类型 | `properties.requirement_type` unless caller overrides |
| 创建时间 | read-only import metadata |
| 描述 | `description` |

## Safety

- `PINGCODE_READONLY=true` blocks create/update calls.
- Imports default to `dryRun=true`.
- Status update tools update one work item per call.
- Token is read from env only and is never returned.
- Request timeout defaults to 15 seconds.

## Distribution

- Internal GitLab hosts source and review history.
- npm package or `npx` command is used by coworkers.
- mcp.so listing should describe capabilities and env config only.
