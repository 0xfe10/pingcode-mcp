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
