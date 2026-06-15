import { z } from "zod";

/** 项目定位片段：编号或内部 ID 二选一，均可省略，省略时回退 env 默认项目。 */
export const projectScope = {
  projectIdentifier: z.string().optional().describe("PingCode 项目标识，默认读取 PINGCODE_PROJECT_IDENTIFIER。"),
  projectId: z.string().optional().describe("PingCode 项目 ID，提供后跳过项目标识查询。"),
};

/** 工作项定位片段：内部 ID 优先，否则按编号解析。 */
export const workItemLocator = {
  workItemId: z.string().optional().describe("PingCode 工作项内部 ID，提供后优先于 identifier。"),
  identifier: z.string().optional().describe("工作项编号，如 MYM-455。"),
};

export const getCurrentTeamSchema = {};

export const getCurrentUserSchema = {};

export const authLoginSchema = {
  code: z
    .string()
    .optional()
    .describe("浏览器授权回调 URL 中的 code 参数；不传则返回授权 URL 与引导。"),
};

export const authStatusSchema = {};

export const authLogoutSchema = {};

export const getTeamMembersSchema = {
  keywords: z.string().optional().describe("按姓名/邮箱等关键字过滤企业成员。"),
  departmentIds: z.array(z.string()).optional().describe("部门 ID 列表，≤20，多个为「任一部门」。"),
  pageIndex: z.number().int().min(0).default(0).optional(),
  pageSize: z.number().int().min(1).max(100).default(30).optional(),
};

export const getWorkItemSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  ...workItemLocator,
  includeComments: z.boolean().default(false).optional().describe("是否一并返回评论列表，默认 false。"),
  includeImages: z
    .boolean()
    .default(true)
    .optional()
    .describe("是否请求 public_image_token 并解析富文本图片，默认 true。"),
  ...projectScope,
};

export const searchWorkItemsSchema = {
  kinds: z
    .array(z.enum(["bug", "requirement"]))
    .min(1)
    .default(["bug", "requirement"])
    .optional()
    .describe("要搜索的工作项类型，默认同时搜索缺陷和需求。"),
  keywords: z.string().optional().describe("按编号或标题搜索。"),
  stateNames: z.array(z.string()).optional().describe("状态名称列表，按各类型分别解析。"),
  priorityNames: z.array(z.string()).optional().describe("优先级名称列表。"),
  assigneeNames: z.array(z.string()).optional().describe("负责人姓名列表。"),
  updatedAfter: z.string().optional().describe("更新时间下界（ISO 或 yyyy-MM-dd），映射为服务端 updated_between 起点。"),
  updatedBefore: z.string().optional().describe("更新时间上界（ISO 或 yyyy-MM-dd），映射为服务端 updated_between 终点。"),
  projectIds: z.array(z.string()).optional().describe("项目 ID 列表（raw），与项目标识解析结果合并去重，≤20。"),
  typeIds: z.array(z.string()).optional().describe("工作项类型 ID 列表（raw），与 kind 解析结果合并去重，≤20。"),
  parentIds: z.array(z.string()).optional().describe("父工作项 ID 列表（raw），≤20。"),
  assigneeIds: z.array(z.string()).optional().describe("负责人 ID 列表（raw），与 assigneeNames 解析结果合并去重，≤20。"),
  stateIds: z.array(z.string()).optional().describe("状态 ID 列表（raw），与 stateNames 解析结果合并去重，≤20。"),
  priorityIds: z.array(z.string()).optional().describe("优先级 ID 列表（raw），与 priorityNames 解析结果合并去重，≤20。"),
  tagIds: z.array(z.string()).optional().describe("标签 ID 列表（raw），≤20。"),
  sprintIds: z.array(z.string()).optional().describe("迭代 ID 列表（raw），≤20。"),
  boardIds: z.array(z.string()).optional().describe("看板 ID 列表（raw），≤20。"),
  entryIds: z.array(z.string()).optional().describe("入口 ID 列表（raw），≤20。"),
  swimlaneIds: z.array(z.string()).optional().describe("泳道 ID 列表（raw），≤20。"),
  phaseIds: z.array(z.string()).optional().describe("阶段 ID 列表（raw），≤20。"),
  versionIds: z.array(z.string()).optional().describe("版本 ID 列表（raw），≤20。"),
  createdByIds: z.array(z.string()).optional().describe("创建人 ID 列表（raw），≤20。"),
  participantId: z.string().optional().describe("参与人 ID（raw，单值）。"),
  createdBetween: z.string().optional().describe("创建时间范围，秒级时间戳 起,止，支持单边，如 1700000000, 或 ,1700000000。"),
  startBetween: z.string().optional().describe("开始时间范围，秒级时间戳 起,止，支持单边，如 1700000000, 或 ,1700000000。"),
  endBetween: z.string().optional().describe("结束时间范围，秒级时间戳 起,止，支持单边，如 1700000000, 或 ,1700000000。"),
  includeDeleted: z.boolean().optional().describe("是否包含已删除工作项，默认 false。"),
  includeArchived: z.boolean().optional().describe("是否包含已归档工作项，默认 false。"),
  pageIndex: z.number().int().min(0).default(0).optional(),
  pageSize: z.number().int().min(1).max(100).default(30).optional(),
  ...projectScope,
};

export const planStatusChangeSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  ...workItemLocator,
  statusName: z.string().optional().describe("目标状态名称，如 已修复、已验收。"),
  stateId: z.string().optional().describe("目标状态 ID；提供后优先于 statusName。"),
  expectedCurrentStatusName: z.string().optional().describe("当前状态保护条件，仅用于在计划中标注是否满足，不阻断（本工具恒只读）。"),
  ...projectScope,
};

export const createWorkItemSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  title: z.string().min(1).describe("工作项标题（必填）。"),
  description: z.string().optional().describe("描述（支持 PingCode 富文本/文本）。"),
  priorityName: z.string().optional().describe("优先级名称，如 普通、较高、最高。"),
  assigneeName: z.string().optional().describe("负责人姓名。"),
  statusName: z
    .string()
    .optional()
    .describe("初始状态名；不传则用类型默认初始态（推荐不传，避免流转校验失败）。"),
  parent: z.string().optional().describe("父工作项编号或内部 ID。"),
  properties: z.record(z.unknown()).optional().describe("自定义属性键值对。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回创建计划；传 false 才真正创建。"),
  ...projectScope,
};

export const bulkUpdateWorkItemsSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  identifiers: z.array(z.string()).min(1).max(100).describe("要批量更新的工作项编号列表，≤100。"),
  priorityName: z.string().optional().describe("目标优先级名称。"),
  assigneeName: z.string().optional().describe("目标负责人姓名。"),
  statusName: z.string().optional().describe("目标状态名称。"),
  stateId: z.string().optional().describe("目标状态 ID；提供后优先于 statusName。"),
  expectedCurrentStatusName: z
    .string()
    .optional()
    .describe("当前状态保护：不匹配的条目被跳过。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回计划；传 false 才执行。"),
  ...projectScope,
};

export const updateWorkItemFieldsSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  ...workItemLocator,
  title: z.string().optional().describe("新标题。"),
  description: z.string().optional().describe("新描述（支持 PingCode 富文本/文本）。"),
  priorityName: z.string().optional().describe("优先级名称，如 普通、较高、最高。"),
  assigneeName: z.string().optional().describe("负责人姓名。"),
  parent: z.string().optional().describe("父工作项编号或内部 ID。"),
  properties: z.record(z.unknown()).optional().describe("自定义属性键值对。"),
  expectedCurrentStatusName: z
    .string()
    .optional()
    .describe("当前状态保护条件（PingCode 无版本号，借此做弱幂等）；不匹配则拒绝写入。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回计划与字段 diff；传 false 才执行 PATCH。"),
  ...projectScope,
};

export const getMyWorkSchema = {
  assigneeName: z.string().optional().describe("覆盖 PINGCODE_DEFAULT_ASSIGNEE_NAME 的负责人姓名（负责人列显示的展示名）。"),
  kinds: z
    .array(z.enum(["bug", "requirement"]))
    .min(1)
    .default(["bug", "requirement"])
    .optional()
    .describe("要聚合的工作项类型，默认同时统计缺陷和需求。"),
  stateNames: z.array(z.string()).optional().describe("状态名称列表，按各类型分别解析过滤。"),
  updatedAfter: z.string().optional().describe("更新时间下界（ISO 或 yyyy-MM-dd），映射为服务端 updated_between 起点。"),
  updatedBefore: z.string().optional().describe("更新时间上界（ISO 或 yyyy-MM-dd），映射为服务端 updated_between 终点。"),
  pageSize: z.number().int().min(1).max(100).default(30).optional(),
  ...projectScope,
};

export const linkWorkItemsSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("源工作项类型，默认 bug。"),
  ...workItemLocator,
  targetIdentifier: z.string().optional().describe("目标工作项编号，如 MYM-456。"),
  targetWorkItemId: z.string().optional().describe("目标工作项内部 ID，提供后优先于 targetIdentifier。"),
  relationType: z
    .string()
    .describe(
      "关系类型。系统枚举：block/blocked_by/relate/duplicate/cause/caused_by/clone/cloned_by/dependency/mention（block=源阻塞目标、blocked_by=源被目标阻塞）；也可传自定义关系类型名/ID。",
    ),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回建立关系计划；传 false 才真正创建。"),
  ...projectScope,
};

export const unlinkWorkItemsSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("源工作项类型，默认 bug。"),
  ...workItemLocator,
  relationId: z.string().describe("要删除的关系 ID（必填），来自 pingcode_list_work_item_relations。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回删除关系计划；传 false 才真正删除。"),
  ...projectScope,
};

export const listWorkItemRelationsSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  ...workItemLocator,
  relationType: z.string().optional().describe("按关系类型过滤（系统枚举或自定义关系类型名/ID）。"),
  ...projectScope,
};

export const triageWorkItemSchema = {
  kind: z.enum(["bug", "requirement"]).default("bug").optional().describe("工作项类型，默认 bug。"),
  ...workItemLocator,
  assigneeName: z.string().optional().describe("新负责人姓名。"),
  priorityName: z.string().optional().describe("新优先级名称。"),
  statusName: z.string().optional().describe("目标状态名称。"),
  stateId: z.string().optional().describe("目标状态 ID；提供后优先于 statusName。"),
  expectedCurrentStatusName: z
    .string()
    .optional()
    .describe("当前状态保护条件；不匹配则整单拒绝，不部分执行。"),
  comment: z.string().min(1).optional().describe("可选：处理后追加的评论。"),
  dryRun: z.boolean().default(true).optional().describe("默认 true，仅返回合并计划；传 false 才执行写入。"),
  ...projectScope,
};
