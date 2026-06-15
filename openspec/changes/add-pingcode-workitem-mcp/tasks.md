# Tasks: PingCode 工作项 MCP 接入

## 1. OpenSpec

- [x] 写 proposal，明确 why/what/scope/success criteria。
- [x] 写 design，明确 API mapping、字段映射、安全策略。
- [x] 写 spec delta，约束 MCP tools 行为。

## 2. Package Skeleton

- [x] 新增 TypeScript package。
- [x] 新增 `.env.example` 与示例 CSV。
- [x] 新增 README。

## 3. PingCode Client

- [x] 环境变量配置。
- [x] HTTP client、超时、错误处理。
- [x] 项目/类型/状态/优先级/成员查询。
- [x] 工作项列表、创建、更新。

## 4. Import Parser

- [x] 支持 `.xlsx` / `.csv`。
- [x] 支持截图表头别名。
- [x] 输出导入计划和未识别列。

## 5. MCP Tools

- [x] `pingcode_get_project_schema`
- [x] `pingcode_list_bugs`
- [x] `pingcode_list_requirements`
- [x] `pingcode_import_bugs`
- [x] `pingcode_import_requirements`
- [x] `pingcode_update_bug_status`
- [x] `pingcode_update_requirement_status`

## 6. Verification

- [x] `npm install`
- [x] `npm run build`
- [x] `npm audit` 为 0 漏洞。
- [x] `npm pack --dry-run` 包内容正常。
- [x] README 配置可被同事复制使用。
