#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { AuthService } from "./pingcode/authService.js";
import { AuthStore } from "./pingcode/authStore.js";
import { summarizeWorkItem, WorkItemService } from "./pingcode/workItemService.js";
import { errorResult, textResult } from "./tools/format.js";
import { importWorkItems } from "./tools/importWorkItems.js";
import {
  authLoginSchema,
  authLogoutSchema,
  authStatusSchema,
  bulkUpdateWorkItemsSchema,
  createWorkItemSchema,
  getCurrentTeamSchema,
  getCurrentUserSchema,
  getTeamMembersSchema,
  getMyWorkSchema,
  getWorkItemSchema,
  linkWorkItemsSchema,
  listWorkItemRelationsSchema,
  planStatusChangeSchema,
  searchWorkItemsSchema,
  triageWorkItemSchema,
  unlinkWorkItemsSchema,
  updateWorkItemFieldsSchema,
} from "./tools/schemas.js";
import { buildSetupGuide } from "./tools/setupGuide.js";

const config = loadConfig();
const authStore = new AuthStore(config.authTokenPath);
const service = new WorkItemService(config, authStore);
const authService = new AuthService(config, authStore);

const server = new McpServer({
  name: "pingcode-mcp",
  version: "0.1.0",
});

const commonListSchema = {
  projectIdentifier: z.string().optional().describe("PingCode 项目标识，默认读取 PINGCODE_PROJECT_IDENTIFIER。"),
  projectId: z.string().optional().describe("PingCode 项目 ID，提供后跳过项目标识查询。"),
  keywords: z.string().optional().describe("按编号或标题搜索。"),
  stateNames: z.array(z.string()).optional().describe("状态名称列表，如 打开、进行中、已完成。"),
  priorityNames: z.array(z.string()).optional().describe("优先级名称列表，如 普通、较高、最高。"),
  assigneeNames: z.array(z.string()).optional().describe("负责人姓名列表。"),
  includePublicImageToken: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否请求 PingCode 返回 public_image_token，用于富文本图片下载。"),
  pageIndex: z.number().int().min(0).default(0).optional(),
  pageSize: z.number().int().min(1).max(100).default(30).optional(),
};

const myListSchema = {
  projectIdentifier: z.string().optional().describe("PingCode 项目标识，默认读取 PINGCODE_PROJECT_IDENTIFIER。"),
  projectId: z.string().optional().describe("PingCode 项目 ID，提供后跳过项目标识查询。"),
  keywords: z.string().optional().describe("按编号或标题搜索。"),
  stateNames: z.array(z.string()).optional().describe("状态名称列表，如 新提交、处理中、已修复。"),
  priorityNames: z.array(z.string()).optional().describe("优先级名称列表，如 普通、较高、最高。"),
  assigneeName: z.string().optional().describe("覆盖 PINGCODE_DEFAULT_ASSIGNEE_NAME 的负责人姓名。"),
  includePublicImageToken: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否请求 PingCode 返回 public_image_token，用于富文本图片下载。"),
  pageIndex: z.number().int().min(0).default(0).optional(),
  pageSize: z.number().int().min(1).max(100).default(30).optional(),
};

const importSchema = {
  filePath: z.string().describe("Excel/CSV 文件路径，支持 .xlsx/.csv。"),
  sheetName: z.string().optional().describe("工作表名称，默认第一个 sheet。"),
  mode: z.enum(["create", "update", "upsert"]).default("upsert").optional(),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回导入计划；传 false 才执行写入。"),
  maxRows: z.number().int().min(1).max(500).default(100).optional(),
  projectIdentifier: z.string().optional(),
  projectId: z.string().optional(),
};

const statusSchema = {
  workItemId: z.string().optional().describe("PingCode 工作项内部 ID。"),
  identifier: z.string().optional().describe("工作项编号，如 MYM-455。"),
  statusName: z.string().optional().describe("目标状态名称，如 挂起、已验收、打开、进行中。"),
  stateId: z.string().optional().describe("目标状态 ID；提供后优先于 statusName。"),
  expectedCurrentStatusName: z.string().optional().describe("可选：当前状态保护条件，不匹配则拒绝更新。"),
  comment: z.string().min(1).optional().describe("可选：状态变更成功后追加评论。"),
  dryRun: z.boolean().default(false).optional().describe("true 时只返回计划，不执行 PATCH。"),
  projectIdentifier: z.string().optional(),
  projectId: z.string().optional(),
};

const markBugsFixedSchema = {
  identifiers: z.array(z.string()).min(1).max(100).describe("要变更状态的缺陷编号列表，如 MYM-505、MYM-503。"),
  statusName: z.string().default("已修复").optional().describe("目标状态，默认 已修复。"),
  stateId: z.string().optional().describe("目标状态 ID；提供后优先于 statusName。"),
  expectedCurrentStatusName: z.string().default("新提交").optional().describe("当前状态保护条件，默认只处理 新提交。"),
  comment: z.string().min(1).optional().describe("可选：每个成功变更状态的缺陷追加同一条评论。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回计划；传 false 才真正修改 PingCode。"),
  projectIdentifier: z.string().optional(),
  projectId: z.string().optional(),
};

const commentSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  workItemId: z.string().optional().describe("PingCode 工作项内部 ID。"),
  identifier: z.string().optional().describe("工作项编号，如 MYM-505。"),
  content: z.string().min(1).describe("评论内容，支持 PingCode 评论富文本/文本内容。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回计划；传 false 才真正写评论。"),
  projectIdentifier: z.string().optional(),
  projectId: z.string().optional(),
};

const listCommentSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  workItemId: z.string().optional().describe("PingCode 工作项内部 ID。"),
  identifier: z.string().optional().describe("工作项编号，如 MYM-505。"),
  projectIdentifier: z.string().optional(),
  projectId: z.string().optional(),
};

server.registerTool(
  "pingcode_get_project_schema",
  {
    title: "Get PingCode Project Schema",
    description: "获取 PingCode 项目、工作项类型、状态、优先级、成员等配置，用于确认 Bug/需求映射。",
    inputSchema: {
      projectIdentifier: z.string().optional(),
      projectId: z.string().optional(),
      kind: z.enum(["bug", "requirement"]).optional(),
      typeId: z.string().optional(),
    },
  },
  async args => {
    try {
      const schema = await service.getSchema(args.kind, {
        projectIdentifier: args.projectIdentifier,
        projectId: args.projectId,
        typeId: args.typeId,
      });
      return textResult({ ok: true, schema });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_get_current_team",
  {
    title: "Get PingCode Current Team",
    description: "获取当前 PingCode 企业/团队信息（只读）。",
    inputSchema: getCurrentTeamSchema,
  },
  async () => {
    try {
      const team = await service.getCurrentTeam();
      return textResult({ ok: true, team });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_get_current_user",
  {
    title: "Get PingCode Current User",
    description:
      "获取当前用户（只读）。应用身份(client_credentials)下 PingCode 无登录用户，自动降级返回配置的默认负责人。",
    inputSchema: getCurrentUserSchema,
  },
  async () => {
    try {
      const result = await service.getCurrentUser();
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_auth_login",
  {
    title: "PingCode User Login (OAuth)",
    description:
      "用户态浏览器授权登录。不传 code：返回授权 URL 与引导，请去浏览器打开并登录授权，再从回调地址复制 code 回来；传 code：用授权码换取并保存用户令牌（0600 本地文件），返回当前用户。不读取浏览器 cookie/storage，不要把网页登录 token 贴进聊天。",
    inputSchema: authLoginSchema,
  },
  async args => {
    try {
      if (!args.code) {
        const { url, state } = authService.buildAuthorizeUrl();
        return textResult({
          ok: true,
          step: "authorize",
          authorizeUrl: url,
          state,
          instructions: [
            "1. 在浏览器中打开 authorizeUrl，使用你本人的 PingCode 账号登录并授权。",
            "2. 授权后浏览器会跳转到回调地址，从地址栏复制其中的 code 参数。",
            "3. 再次调用本工具并传入 code 完成登录。",
            "注意：本工具不读取浏览器 cookie/localStorage，请勿把网页登录的 token 贴进聊天。",
          ],
        });
      }

      const { user } = await authService.loginWithCode(args.code);
      return textResult({ ok: true, step: "logged_in", user });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_auth_status",
  {
    title: "PingCode Auth Status",
    description: "查询当前鉴权状态：模式（user / env-token / application）、是否已授权、相对过期秒数、当前用户。不返回任何 token。",
    inputSchema: authStatusSchema,
  },
  async () => {
    try {
      const status = await authService.status();
      return textResult({ ok: true, ...status });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_auth_logout",
  {
    title: "PingCode Auth Logout",
    description: "清除本地保存的用户态 token（删除 0600 token 文件）。",
    inputSchema: authLogoutSchema,
  },
  async () => {
    try {
      const result = authService.logout();
      return textResult(result);
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_get_team_members",
  {
    title: "List PingCode Team Members",
    description: "查询企业成员列表（只读），支持关键字与部门 ID（≤20）过滤、分页。",
    inputSchema: getTeamMembersSchema,
  },
  async args => {
    try {
      const result = await service.listTeamMembers(args);
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_check_setup",
  {
    title: "Check PingCode MCP Setup",
    description:
      "检查 PingCode MCP 配置是否完整，并返回需要在聊天框向使用者询问的信息、每个信息去哪里找、以及 env 配置模板。",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(buildSetupGuide(config));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_list_bugs",
  {
    title: "List PingCode Bugs",
    description: "拉取 PingCode 缺陷列表，默认项目为 MYM。",
    inputSchema: commonListSchema,
  },
  async args => {
    try {
      const page = await service.list("bug", args);
      return textResult({
        ok: true,
        total: page.total,
        pageIndex: page.page_index,
        pageSize: page.page_size,
        values: page.values.map(item => summarizeWorkItem(item, config.baseUrl)),
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_list_requirements",
  {
    title: "List PingCode Requirements",
    description: "拉取 PingCode 需求清单，默认项目为 MYM。",
    inputSchema: commonListSchema,
  },
  async args => {
    try {
      const page = await service.list("requirement", args);
      return textResult({
        ok: true,
        total: page.total,
        pageIndex: page.page_index,
        pageSize: page.page_size,
        values: page.values.map(item => summarizeWorkItem(item, config.baseUrl)),
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_list_my_bugs",
  {
    title: "List My PingCode Bugs",
    description: "拉取当前使用者负责的 PingCode 缺陷。默认负责人读取 PINGCODE_DEFAULT_ASSIGNEE_NAME。",
    inputSchema: myListSchema,
  },
  async args => {
    try {
      const assigneeName = await service.resolveCurrentAssigneeName(args.assigneeName);
      const page = await service.list("bug", { ...args, assigneeNames: [assigneeName] });
      return textResult({
        ok: true,
        assigneeName,
        total: page.total,
        pageIndex: page.page_index,
        pageSize: page.page_size,
        values: page.values.map(item => summarizeWorkItem(item, config.baseUrl)),
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_list_my_requirements",
  {
    title: "List My PingCode Requirements",
    description: "拉取当前使用者负责的 PingCode 需求。默认负责人读取 PINGCODE_DEFAULT_ASSIGNEE_NAME。",
    inputSchema: myListSchema,
  },
  async args => {
    try {
      const assigneeName = await service.resolveCurrentAssigneeName(args.assigneeName);
      const page = await service.list("requirement", { ...args, assigneeNames: [assigneeName] });
      return textResult({
        ok: true,
        assigneeName,
        total: page.total,
        pageIndex: page.page_index,
        pageSize: page.page_size,
        values: page.values.map(item => summarizeWorkItem(item, config.baseUrl)),
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_import_bugs",
  {
    title: "Import PingCode Bugs",
    description: "按截图表头从 .xlsx/.csv 导入缺陷。默认 dryRun=true。",
    inputSchema: importSchema,
  },
  async args => {
    try {
      const result = await importWorkItems(config, { ...args, kind: "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_import_requirements",
  {
    title: "Import PingCode Requirements",
    description: "按截图表头从 .xlsx/.csv 导入需求清单。默认 dryRun=true。",
    inputSchema: importSchema,
  },
  async args => {
    try {
      const result = await importWorkItems(config, { ...args, kind: "requirement" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_update_bug_status",
  {
    title: "Update PingCode Bug Status",
    description: "按编号或工作项 ID 修改单个缺陷状态。",
    inputSchema: statusSchema,
  },
  async args => {
    try {
      const result = await service.updateStatus({ ...args, kind: "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_mark_bugs_fixed",
  {
    title: "Mark PingCode Bugs Fixed",
    description: "修完 bug 后批量把缺陷从 新提交 更新为 已修复。默认 dryRun=true，并校验当前状态仍为 新提交。",
    inputSchema: markBugsFixedSchema,
  },
  async args => {
    try {
      const result = await service.updateStatuses({ ...args, kind: "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_add_work_item_comment",
  {
    title: "Add PingCode Work Item Comment",
    description: "按编号或工作项 ID 给 PingCode 缺陷/需求追加评论。默认 dryRun=true。",
    inputSchema: commentSchema,
  },
  async args => {
    try {
      const result = await service.addComment({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_list_work_item_comments",
  {
    title: "List PingCode Work Item Comments",
    description: "按编号或工作项 ID 获取 PingCode 缺陷/需求评论列表。",
    inputSchema: listCommentSchema,
  },
  async args => {
    try {
      const result = await service.listComments({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_update_requirement_status",
  {
    title: "Update PingCode Requirement Status",
    description: "按编号或工作项 ID 修改单个需求状态。",
    inputSchema: statusSchema,
  },
  async args => {
    try {
      const result = await service.updateStatus({ ...args, kind: "requirement" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_get_work_item",
  {
    title: "Get PingCode Work Item",
    description: "按编号或工作项 ID 获取单个缺陷/需求的完整详情（描述、时间、父项、属性、图片），可选附带评论。",
    inputSchema: getWorkItemSchema,
  },
  async args => {
    try {
      const result = await service.getWorkItemDetail({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_search_work_items",
  {
    title: "Search PingCode Work Items",
    description:
      "跨缺陷与需求统一搜索：支持关键字、状态/优先级/负责人（按名称）与更新时间范围；并支持 raw 过滤——项目/类型/父项/负责人/状态/优先级/标签/迭代/看板/入口/泳道/阶段/版本/创建人 ID 列表（≤20，与对应 name 合并去重）、participantId 单值、createdBetween/startBetween/endBetween 秒级时间戳、includeDeleted/includeArchived 布尔。返回按 id 去重的合并结果与各类型总数。",
    inputSchema: searchWorkItemsSchema,
  },
  async args => {
    try {
      const result = await service.searchWorkItems({ ...args, kinds: args.kinds ?? ["bug", "requirement"] });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_plan_status_change",
  {
    title: "Plan PingCode Status Change",
    description:
      "只读：返回工作项状态变更计划（当前状态、目标状态、可用状态、保护条件是否满足）。PingCode 不校验工作流，目标是否合法以实际 PATCH 为准。",
    inputSchema: planStatusChangeSchema,
  },
  async args => {
    try {
      const result = await service.planStatusChange({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_update_work_item_fields",
  {
    title: "Update PingCode Work Item Fields",
    description: "按编号或工作项 ID 编辑标题、描述、优先级、负责人、父项、自定义属性。默认 dryRun=true，仅 PATCH 变化字段。",
    inputSchema: updateWorkItemFieldsSchema,
  },
  async args => {
    try {
      const result = await service.updateWorkItemFields({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_bulk_update_work_items",
  {
    title: "Bulk Update PingCode Work Items",
    description:
      "用原生批量端点为多个工作项编号批量改优先级/负责人/状态。默认 dryRun=true，支持 expectedCurrentStatusName 跳过不匹配项；每个变更字段各发一次 bulk PATCH。",
    inputSchema: bulkUpdateWorkItemsSchema,
  },
  async args => {
    try {
      const result = await service.bulkUpdateWorkItems({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_create_work_item",
  {
    title: "Create PingCode Work Item",
    description: "创建单个缺陷/需求，必填标题，可选描述、优先级、负责人、父项、初始状态、属性。默认 dryRun=true，仅返回创建计划。",
    inputSchema: createWorkItemSchema,
  },
  async args => {
    try {
      const result = await service.createWorkItem({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_triage_work_item",
  {
    title: "Triage PingCode Work Item",
    description: "一站式处理工作项：合并负责人/优先级/状态变更为一次 PATCH，并可选追加评论。默认 dryRun=true。",
    inputSchema: triageWorkItemSchema,
  },
  async args => {
    try {
      const result = await service.triageWorkItem({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_get_my_work",
  {
    title: "Get My PingCode Work",
    description:
      "聚合当前负责人的缺陷与需求并按状态分组（每组带计数、按工作项 ID 去重）。支持 assigneeName 覆盖默认负责人、状态与更新时间过滤。只读。",
    inputSchema: getMyWorkSchema,
  },
  async args => {
    try {
      const result = await service.getMyWork(args);
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_link_work_items",
  {
    title: "Link PingCode Work Items",
    description:
      "在两个工作项间建立关系（阻塞/被阻塞/重复/关联/依赖等）。relationType 支持系统枚举或自定义关系类型名/ID。默认 dryRun=true，仅返回计划。",
    inputSchema: linkWorkItemsSchema,
  },
  async args => {
    try {
      const result = await service.linkWorkItems({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_unlink_work_items",
  {
    title: "Unlink PingCode Work Items",
    description: "按 relationId 删除工作项的某条关系；relationId 来自 pingcode_list_work_item_relations。默认 dryRun=true。",
    inputSchema: unlinkWorkItemsSchema,
  },
  async args => {
    try {
      const result = await service.unlinkWorkItems({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "pingcode_list_work_item_relations",
  {
    title: "List PingCode Work Item Relations",
    description: "按编号或工作项 ID 列出工作项的全部关系（可按 relationType 过滤），返回每条关系的 id 与目标工作项。",
    inputSchema: listWorkItemRelationsSchema,
  },
  async args => {
    try {
      const result = await service.listWorkItemRelations({ ...args, kind: args.kind ?? "bug" });
      return textResult({ ok: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[pingcode-mcp] ${message}`);
  process.exit(1);
});
