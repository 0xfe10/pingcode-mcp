import type { PingCodeConfig } from "../config.js";
import { assertWritable } from "../config.js";
import type {
  PageResponse,
  PingCodeProject,
  ProjectMember,
  WorkItem,
  WorkItemPayload,
  WorkItemPriority,
  WorkItemState,
  WorkItemType,
} from "./types.js";
import { PingCodeClient } from "./client.js";

export type WorkItemKind = "bug" | "requirement";

export interface SchemaContext {
  project: PingCodeProject;
  type: WorkItemType;
  types: WorkItemType[];
  states: WorkItemState[];
  priorities: WorkItemPriority[];
  members: ProjectMember[];
}

export interface ListOptions {
  projectIdentifier?: string;
  projectId?: string;
  typeId?: string;
  stateNames?: string[];
  priorityNames?: string[];
  assigneeNames?: string[];
  keywords?: string;
  updatedBetween?: string;
  includePublicImageToken?: boolean;
  pageIndex?: number;
  pageSize?: number;
}

export interface StatusUpdateOptions {
  kind: WorkItemKind;
  workItemId?: string;
  identifier?: string;
  statusName?: string;
  stateId?: string;
  expectedCurrentStatusName?: string;
  comment?: string;
  projectIdentifier?: string;
  projectId?: string;
  dryRun?: boolean;
}

export interface BatchStatusUpdateOptions {
  kind: WorkItemKind;
  identifiers: string[];
  statusName?: string;
  stateId?: string;
  expectedCurrentStatusName?: string;
  comment?: string;
  projectIdentifier?: string;
  projectId?: string;
  dryRun?: boolean;
}

export interface CreateWorkItemOptions {
  kind: WorkItemKind;
  title: string;
  description?: string;
  priorityName?: string;
  assigneeName?: string;
  statusName?: string;
  parent?: string;
  properties?: Record<string, unknown>;
  dryRun?: boolean;
  projectIdentifier?: string;
  projectId?: string;
}

export interface BulkUpdateWorkItemsOptions {
  kind: WorkItemKind;
  identifiers: string[];
  priorityName?: string;
  assigneeName?: string;
  statusName?: string;
  stateId?: string;
  expectedCurrentStatusName?: string;
  dryRun?: boolean;
  projectIdentifier?: string;
  projectId?: string;
}

export interface CommentOptions {
  kind: WorkItemKind;
  workItemId?: string;
  identifier?: string;
  content: string;
  projectIdentifier?: string;
  projectId?: string;
  dryRun?: boolean;
}

export interface ListCommentOptions {
  kind: WorkItemKind;
  workItemId?: string;
  identifier?: string;
  projectIdentifier?: string;
  projectId?: string;
}

export interface GetWorkItemDetailOptions {
  kind: WorkItemKind;
  workItemId?: string;
  identifier?: string;
  includeComments?: boolean;
  includeImages?: boolean;
  projectIdentifier?: string;
  projectId?: string;
}

export interface SearchWorkItemsOptions {
  kinds: WorkItemKind[];
  keywords?: string;
  stateNames?: string[];
  priorityNames?: string[];
  assigneeNames?: string[];
  updatedAfter?: string;
  updatedBefore?: string;
  pageIndex?: number;
  pageSize?: number;
  projectIdentifier?: string;
  projectId?: string;
}

export interface PlanStatusChangeOptions {
  kind: WorkItemKind;
  workItemId?: string;
  identifier?: string;
  statusName?: string;
  stateId?: string;
  expectedCurrentStatusName?: string;
  projectIdentifier?: string;
  projectId?: string;
}

export interface UpdateWorkItemFieldsOptions {
  kind: WorkItemKind;
  workItemId?: string;
  identifier?: string;
  title?: string;
  description?: string;
  priorityName?: string;
  assigneeName?: string;
  parent?: string;
  properties?: Record<string, unknown>;
  expectedCurrentStatusName?: string;
  dryRun?: boolean;
  projectIdentifier?: string;
  projectId?: string;
}

export interface TriageWorkItemOptions {
  kind: WorkItemKind;
  workItemId?: string;
  identifier?: string;
  assigneeName?: string;
  priorityName?: string;
  statusName?: string;
  stateId?: string;
  expectedCurrentStatusName?: string;
  comment?: string;
  dryRun?: boolean;
  projectIdentifier?: string;
  projectId?: string;
}

interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

const TYPE_NAME_CANDIDATES: Record<WorkItemKind, string[]> = {
  bug: ["缺陷", "bug", "BUG"],
  requirement: ["需求", "用户故事", "story", "requirement"],
};

export class WorkItemService {
  private readonly client: PingCodeClient;

  constructor(private readonly config: PingCodeConfig) {
    this.client = new PingCodeClient(config);
  }

  async getSchema(kind?: WorkItemKind, options: { projectIdentifier?: string; projectId?: string; typeId?: string } = {}) {
    const project = await this.client.resolveProject(
      options.projectIdentifier ?? this.config.projectIdentifier,
      options.projectId ?? this.config.projectId,
    );
    const [types, priorities, members] = await Promise.all([
      this.client.getWorkItemTypes(project.id),
      this.client.getWorkItemPriorities(project.id),
      this.client.getProjectMembers(project.id),
    ]);

    if (!kind) {
      return { project, types, priorities, members };
    }

    const type = this.resolveType(types, kind, options.typeId);
    const states = await this.client.getWorkItemStates(project.id, type.id);
    return { project, type, types, states, priorities, members };
  }

  async list(kind: WorkItemKind, options: ListOptions = {}): Promise<PageResponse<WorkItem>> {
    const schema = await this.getKindSchema(kind, options);
    const stateIds = this.namesToIds(options.stateNames, schema.states, "状态");
    const priorityIds = this.namesToIds(options.priorityNames, schema.priorities, "优先级");
    const assigneeIds = this.memberNamesToIds(options.assigneeNames, schema.members);

    return this.client.listWorkItems({
      project_ids: schema.project.id,
      type_ids: schema.type.id,
      state_ids: stateIds.join(",") || undefined,
      priority_ids: priorityIds.join(",") || undefined,
      assignee_ids: assigneeIds.join(",") || undefined,
      keywords: options.keywords,
      updated_between: options.updatedBetween,
      include_public_image_token: options.includePublicImageToken,
      page_index: options.pageIndex,
      page_size: options.pageSize,
    });
  }

  async findByIdentifier(identifier: string, projectId?: string, typeId?: string): Promise<WorkItem | undefined> {
    const page = await this.client.listWorkItems({
      identifier,
      project_ids: projectId,
      type_ids: typeId,
      page_index: 0,
      page_size: 1,
    });
    return page.values[0];
  }

  async create(payload: WorkItemPayload): Promise<WorkItem> {
    assertWritable(this.config);
    return this.client.createWorkItem(payload);
  }

  async update(workItemId: string, payload: WorkItemPayload): Promise<WorkItem> {
    assertWritable(this.config);
    return this.client.updateWorkItem(workItemId, payload);
  }

  async createWorkItem(options: CreateWorkItemOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });

    const payload: WorkItemPayload = {
      project_id: schema.project.id,
      type_id: schema.type.id,
      title: options.title,
    };
    if (options.description !== undefined) payload.description = options.description;
    if (options.priorityName) payload.priority_id = this.resolveNamed(options.priorityName, schema.priorities, "优先级").id;
    if (options.assigneeName) payload.assignee_id = this.resolveMember(options.assigneeName, schema.members).id;
    if (options.parent) payload.parent_id = await this.resolveParentId(options.parent, schema.project.id);
    if (options.statusName) payload.state_id = this.resolveNamed(options.statusName, schema.states, "状态").id;
    if (options.properties !== undefined) payload.properties = options.properties;

    const plan = {
      project: { id: schema.project.id, identifier: schema.project.identifier, name: schema.project.name },
      type: { id: schema.type.id, name: schema.type.name },
      payload,
    };

    const result = await this.runMutation(options.dryRun ?? true, async () => ({
      plan,
      noChange: false,
      execute: async () => ({ created: summarizeWorkItem(await this.client.createWorkItem(payload), this.config.baseUrl) }),
    }));

    return { dryRun: result.dryRun, plan, created: result.executed?.created };
  }

  async updateStatus(options: StatusUpdateOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const item = await this.resolveWorkItem(options.workItemId, options.identifier, schema);
    const nextStateId = options.stateId ?? this.resolveNamed(options.statusName, schema.states, "状态").id;

    if (options.expectedCurrentStatusName && item.state?.name !== options.expectedCurrentStatusName) {
      throw new Error(
        `当前状态不符合预期：${item.identifier ?? item.id} 当前为 ${item.state?.name ?? "未知"}，预期为 ${options.expectedCurrentStatusName}`,
      );
    }

    const result = {
      dryRun: options.dryRun ?? false,
      target: summarizeWorkItem(item, this.config.baseUrl),
      fromStatus: item.state?.name,
      toStateId: nextStateId,
      toStatus: schema.states.find(state => state.id === nextStateId)?.name ?? options.statusName,
    };

    if (result.dryRun) return result;

    const updated = await this.update(item.id, { state_id: nextStateId });
    const comment = options.comment ? await this.addCommentByWorkItemId(updated.id, options.comment) : undefined;
    return { ...result, updated: summarizeWorkItem(updated, this.config.baseUrl), comment };
  }

  async updateStatuses(options: BatchStatusUpdateOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const identifiers = [...new Set(options.identifiers.map(value => value.trim()).filter(Boolean))];
    const nextStateId = options.stateId ?? this.resolveNamed(options.statusName, schema.states, "状态").id;
    const result = {
      dryRun: options.dryRun ?? true,
      total: identifiers.length,
      expectedCurrentStatusName: options.expectedCurrentStatusName,
      toStateId: nextStateId,
      toStatus: schema.states.find(state => state.id === nextStateId)?.name ?? options.statusName,
      comment: options.comment,
      planned: [] as unknown[],
      executed: [] as unknown[],
      skipped: [] as unknown[],
      failed: [] as unknown[],
    };

    if (!result.dryRun) {
      assertWritable(this.config);
    }

    for (const identifier of identifiers) {
      try {
        const item = await this.findByIdentifier(identifier, schema.project.id, schema.type.id);
        if (!item) {
          result.failed.push({ identifier, error: "未找到工作项" });
          continue;
        }

        const currentStatus = item.state?.name;
        const target = summarizeWorkItem(item, this.config.baseUrl);
        if (options.expectedCurrentStatusName && currentStatus !== options.expectedCurrentStatusName) {
          result.skipped.push({
            identifier,
            target,
            currentStatus,
            reason: `当前状态不是 ${options.expectedCurrentStatusName}`,
          });
          continue;
        }

        const plan = {
          identifier,
          target,
          fromStatus: currentStatus,
          toStateId: nextStateId,
          toStatus: result.toStatus,
          comment: options.comment,
        };
        result.planned.push(plan);

        if (!result.dryRun) {
          const updated = await this.update(item.id, { state_id: nextStateId });
          const comment = options.comment ? await this.addCommentByWorkItemId(updated.id, options.comment) : undefined;
          result.executed.push({ ...plan, updated: summarizeWorkItem(updated, this.config.baseUrl), comment });
        }
      } catch (error) {
        result.failed.push({ identifier, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return result;
  }

  async bulkUpdateWorkItems(options: BulkUpdateWorkItemsOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });

    // 把目标值（名转 id）解析成原生 bulk 端点要求的 {property_name, property_value} 列表。
    const fields: { field: string; property_name: string; property_value: string }[] = [];
    if (options.priorityName) {
      fields.push({ field: "priority", property_name: "priority_id", property_value: this.resolveNamed(options.priorityName, schema.priorities, "优先级").id });
    }
    if (options.assigneeName) {
      fields.push({ field: "assignee", property_name: "assignee_id", property_value: this.resolveMember(options.assigneeName, schema.members).id });
    }
    if (options.stateId || options.statusName) {
      const stateId = options.stateId ?? this.resolveNamed(options.statusName, schema.states, "状态").id;
      const toStatus = schema.states.find(state => state.id === stateId)?.name ?? options.statusName;
      fields.push({ field: `status(${toStatus ?? stateId})`, property_name: "state_id", property_value: stateId });
    }
    if (fields.length === 0) {
      throw new Error("至少要提供一个目标字段：priorityName、assigneeName、statusName 或 stateId。");
    }

    const identifiers = [...new Set(options.identifiers.map(value => value.trim()).filter(Boolean))];
    const changes = fields.map(({ field, property_name, property_value }) => ({ field, property_name, property_value }));
    const dryRun = options.dryRun ?? true;
    const planned: unknown[] = [];
    const skipped: unknown[] = [];
    const failed: unknown[] = [];
    const eligibleIds: string[] = [];

    for (const identifier of identifiers) {
      try {
        const item = await this.findByIdentifier(identifier, schema.project.id, schema.type.id);
        if (!item) {
          failed.push({ identifier, error: "未找到工作项" });
          continue;
        }
        const currentStatus = item.state?.name;
        if (options.expectedCurrentStatusName && currentStatus !== options.expectedCurrentStatusName) {
          skipped.push({ identifier, currentStatus, reason: `当前状态不是 ${options.expectedCurrentStatusName}` });
          continue;
        }
        planned.push({ identifier, id: item.id, fromStatus: currentStatus, changes });
        eligibleIds.push(item.id);
      } catch (error) {
        failed.push({ identifier, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (dryRun) {
      return { dryRun, total: identifiers.length, planned, skipped, failed, fields: changes };
    }

    assertWritable(this.config);

    const executed: { field: string; idCount: number; ok: boolean; error?: string }[] = [];
    if (eligibleIds.length > 0) {
      for (const { field, property_name, property_value } of fields) {
        try {
          await this.client.bulkUpdateWorkItems(eligibleIds, property_name, property_value);
          executed.push({ field, idCount: eligibleIds.length, ok: true });
        } catch (error) {
          executed.push({ field, idCount: eligibleIds.length, ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    return { dryRun, total: identifiers.length, planned, skipped, failed, fields: changes, executed };
  }

  async listComments(options: ListCommentOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const item = await this.resolveWorkItem(options.workItemId, options.identifier, schema);
    const page = await this.client.listWorkItemComments(item.id);
    return {
      target: summarizeWorkItem(item, this.config.baseUrl),
      total: page.total,
      pageIndex: page.page_index,
      pageSize: page.page_size,
      values: page.values,
    };
  }

  async addComment(options: CommentOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const item = await this.resolveWorkItem(options.workItemId, options.identifier, schema);
    const result = {
      dryRun: options.dryRun ?? true,
      target: summarizeWorkItem(item, this.config.baseUrl),
      content: options.content,
    };

    if (result.dryRun) return result;

    const comment = await this.addCommentByWorkItemId(item.id, options.content);
    return { ...result, comment };
  }

  async getWorkItemDetail(options: GetWorkItemDetailOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const includeImages = options.includeImages ?? true;
    const item = await this.resolveWorkItemStrict(options.workItemId, options.identifier, schema);
    const detail = detailWorkItem(item, this.config.baseUrl, { includeImages });

    if (!options.includeComments) {
      return { target: detail };
    }

    const page = await this.client.listWorkItemComments(item.id);
    return {
      target: detail,
      comments: {
        total: page.total,
        pageIndex: page.page_index,
        pageSize: page.page_size,
        values: page.values,
      },
    };
  }

  async searchWorkItems(options: SearchWorkItemsOptions) {
    const updatedBetween = buildUpdatedBetween(options.updatedAfter, options.updatedBefore);
    const byKind: { kind: WorkItemKind; total: number; pageIndex: number; pageSize: number }[] = [];
    const values: ReturnType<typeof summarizeWorkItem>[] = [];

    for (const kind of options.kinds) {
      const page = await this.list(kind, {
        projectIdentifier: options.projectIdentifier,
        projectId: options.projectId,
        keywords: options.keywords,
        stateNames: options.stateNames,
        priorityNames: options.priorityNames,
        assigneeNames: options.assigneeNames,
        updatedBetween,
        pageIndex: options.pageIndex,
        pageSize: options.pageSize,
      });
      byKind.push({ kind, total: page.total, pageIndex: page.page_index, pageSize: page.page_size });
      for (const item of page.values) {
        values.push(summarizeWorkItem(item, this.config.baseUrl));
      }
    }

    const total = byKind.reduce((sum, entry) => sum + entry.total, 0);
    return { total, byKind, values };
  }

  async planStatusChange(options: PlanStatusChangeOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const item = await this.resolveWorkItemStrict(options.workItemId, options.identifier, schema);
    const currentStatus = item.state?.name;
    const currentStateId = item.state?.id;

    const wantsChange = Boolean(options.stateId || options.statusName);
    const toStateId = options.stateId ?? (options.statusName ? this.resolveNamed(options.statusName, schema.states, "状态").id : undefined);
    const toStatus = toStateId ? schema.states.find(state => state.id === toStateId)?.name ?? options.statusName : undefined;

    const expectedSatisfied = options.expectedCurrentStatusName
      ? currentStatus === options.expectedCurrentStatusName
      : undefined;

    const workflow = await this.resolveLegalTransitions(schema, currentStateId, toStateId);

    return {
      target: summarizeWorkItem(item, this.config.baseUrl),
      currentStatus,
      currentStateId,
      toStatus,
      toStateId,
      availableStates: schema.states.map(state => ({ id: state.id, name: state.name })),
      allowedTransitions: workflow.allowedTransitions,
      transitionAllowed: workflow.transitionAllowed,
      expectedCurrentStatusName: options.expectedCurrentStatusName,
      expectedSatisfied,
      willChange: wantsChange && toStateId !== currentStateId,
      note: workflow.note,
    };
  }

  /**
   * 基于状态方案 + 工作流流转，预检当前状态可达的合法目标状态（保持只读）。
   * 解析不到方案 / 任一查询失败时整体回退，仅置 allowedTransitions=undefined 并标注未预检，不让 plan 报错。
   */
  private async resolveLegalTransitions(
    schema: SchemaContext,
    currentStateId: string | undefined,
    toStateId: string | undefined,
  ): Promise<{
    allowedTransitions?: { id: string; name?: string }[];
    transitionAllowed?: boolean;
    note: string;
  }> {
    const fallback = {
      allowedTransitions: undefined,
      transitionAllowed: undefined,
      note: "未能解析状态方案，无法预检合法流转，目标以实际 PATCH 为准。",
    };

    if (!currentStateId) return fallback;

    try {
      const plans = await this.client.getWorkItemStatePlans(schema.project.id);
      const projectType = schema.project.type;
      const typeId = schema.type.id;
      const typeName = schema.type.name;
      const plan = plans.find(p => {
        const typeMatch = p.work_item_type === typeId || p.work_item_type === typeName;
        const projectMatch = projectType ? p.project_type === projectType : true;
        return typeMatch && projectMatch;
      });
      if (!plan) return fallback;

      const flows = await this.client.getWorkItemStateFlows(plan.id, currentStateId);
      const allowedTransitions = flows
        .map((flow): { id: string; name?: string } | undefined => {
          const id = flow.to_state?.id ?? flow.to_state_id;
          if (!id) return undefined;
          const name = flow.to_state?.name ?? schema.states.find(state => state.id === id)?.name;
          return { id, name };
        })
        .filter((entry): entry is { id: string; name?: string } => entry !== undefined);

      const transitionAllowed = toStateId ? allowedTransitions.some(entry => entry.id === toStateId) : undefined;

      return {
        allowedTransitions,
        transitionAllowed,
        note: "已基于工作流预检合法流转。",
      };
    } catch {
      return fallback;
    }
  }

  async updateWorkItemFields(options: UpdateWorkItemFieldsOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const item = await this.resolveWorkItemStrict(options.workItemId, options.identifier, schema);
    const target = summarizeWorkItem(item, this.config.baseUrl);
    const expectedSatisfied = this.assertExpectedStatus(item, options.expectedCurrentStatusName);

    const { payload, changes } = await this.buildFieldChanges(item, schema, {
      title: options.title,
      description: options.description,
      priorityName: options.priorityName,
      assigneeName: options.assigneeName,
      parent: options.parent,
      properties: options.properties,
    });
    const noChange = changes.length === 0;

    const result = await this.runMutation(options.dryRun ?? true, async () => ({
      plan: { target, payload, changes, expectedSatisfied, noChange },
      noChange,
      execute: async () => ({ updated: summarizeWorkItem(await this.update(item.id, payload), this.config.baseUrl) }),
    }));

    return {
      dryRun: result.dryRun,
      target,
      payload,
      changes,
      noChange,
      expectedSatisfied,
      updated: result.executed?.updated,
    };
  }

  async triageWorkItem(options: TriageWorkItemOptions) {
    const schema = await this.getKindSchema(options.kind, {
      projectIdentifier: options.projectIdentifier,
      projectId: options.projectId,
    });
    const item = await this.resolveWorkItemStrict(options.workItemId, options.identifier, schema);
    const target = summarizeWorkItem(item, this.config.baseUrl);
    const expectedSatisfied = this.assertExpectedStatus(item, options.expectedCurrentStatusName);

    // assignee/priority 与 state 合并为同一份 PATCH payload。
    const { payload, changes } = await this.buildFieldChanges(item, schema, {
      priorityName: options.priorityName,
      assigneeName: options.assigneeName,
    });

    let statusChange: { from?: string; toStateId: string; toStatus?: string } | undefined;
    const wantsStatus = Boolean(options.stateId || options.statusName);
    if (wantsStatus) {
      const toStateId = options.stateId ?? this.resolveNamed(options.statusName, schema.states, "状态").id;
      if (toStateId !== item.state?.id) {
        payload.state_id = toStateId;
        statusChange = {
          from: item.state?.name,
          toStateId,
          toStatus: schema.states.find(state => state.id === toStateId)?.name ?? options.statusName,
        };
      }
    }

    const hasFieldUpdate = Object.keys(payload).length > 0;
    const commentToAdd = options.comment;
    const noChange = !hasFieldUpdate && !commentToAdd;

    const plan = { target, fieldChanges: changes, statusChange, commentToAdd, expectedSatisfied, noChange };

    const result = await this.runMutation(options.dryRun ?? true, async () => ({
      plan,
      noChange,
      execute: async () => {
        const steps: { step: string; ok: boolean; error?: string }[] = [];
        let updated: ReturnType<typeof summarizeWorkItem> | undefined;
        let comment: Awaited<ReturnType<typeof this.addCommentByWorkItemId>> | undefined;

        if (hasFieldUpdate) {
          updated = summarizeWorkItem(await this.update(item.id, payload), this.config.baseUrl);
          steps.push({ step: "update", ok: true });
        }
        if (commentToAdd) {
          comment = await this.addCommentByWorkItemId(item.id, commentToAdd);
          steps.push({ step: "comment", ok: true });
        }

        return { updated, comment, steps };
      },
    }));

    return { dryRun: result.dryRun, plan, executed: result.executed };
  }

  async buildPayload(
    kind: WorkItemKind,
    row: {
      title?: string;
      description?: string;
      statusName?: string;
      priorityName?: string;
      assigneeName?: string;
      parent?: string;
      requirementType?: string;
    },
    schema: SchemaContext,
  ): Promise<WorkItemPayload> {
    const payload: WorkItemPayload = {
      project_id: schema.project.id,
      type_id: schema.type.id,
    };

    if (row.title) payload.title = row.title;
    if (row.description) payload.description = row.description;
    if (row.statusName) payload.state_id = this.resolveNamed(row.statusName, schema.states, "状态").id;
    if (row.priorityName) payload.priority_id = this.resolveNamed(row.priorityName, schema.priorities, "优先级").id;
    if (row.assigneeName) payload.assignee_id = this.resolveMember(row.assigneeName, schema.members).id;
    if (row.parent) payload.parent_id = await this.resolveParentId(row.parent, schema.project.id);
    if (kind === "requirement" && row.requirementType) {
      payload.properties = { requirement_type: row.requirementType };
    }

    return payload;
  }

  async getKindSchema(kind: WorkItemKind, options: { projectIdentifier?: string; projectId?: string; typeId?: string } = {}) {
    return this.getSchema(kind, options) as Promise<SchemaContext>;
  }

  private resolveType(types: WorkItemType[], kind: WorkItemKind, explicitTypeId?: string): WorkItemType {
    const configuredTypeId = explicitTypeId ?? (kind === "bug" ? this.config.bugTypeId : this.config.requirementTypeId);
    if (configuredTypeId) {
      const byId = types.find(type => type.id === configuredTypeId);
      if (byId) return byId;
      return { id: configuredTypeId, name: configuredTypeId };
    }

    const candidates = TYPE_NAME_CANDIDATES[kind].map(normalizeName);
    const found = types.find(type => candidates.includes(normalizeName(type.name)) || candidates.includes(normalizeName(type.id)));
    if (!found) {
      throw new Error(`未找到 ${kind} 工作项类型，可用类型：${types.map(type => `${type.name}(${type.id})`).join(", ")}`);
    }
    return found;
  }

  private namesToIds<T extends { id: string; name?: string }>(names: string[] | undefined, values: T[], label: string): string[] {
    return (names ?? []).map(name => this.resolveNamed(name, values, label).id);
  }

  private memberNamesToIds(names: string[] | undefined, members: ProjectMember[]): string[] {
    return (names ?? []).map(name => this.resolveMember(name, members).id);
  }

  private resolveNamed<T extends { id: string; name?: string }>(name: string | undefined, values: T[], label: string): T {
    if (!name) throw new Error(`缺少${label}名称`);
    const normalized = normalizeName(name);
    const value = values.find(item => normalizeName(item.name ?? item.id) === normalized || normalizeName(item.id) === normalized);
    if (!value) {
      throw new Error(`未找到${label}：${name}，可用值：${values.map(item => item.name ?? item.id).join(", ")}`);
    }
    return value;
  }

  private resolveMember(name: string, members: ProjectMember[]): ProjectMember {
    const normalized = normalizeName(name);
    const member = members.find(item => {
      const user = item.user;
      return [item.id, item.name, item.display_name, user?.id, user?.name, user?.display_name]
        .filter(Boolean)
        .some(value => normalizeName(String(value)) === normalized);
    });
    if (!member) {
      const available = members.map(item => item.user?.display_name ?? item.user?.name ?? item.display_name ?? item.name ?? item.id);
      throw new Error(`未找到负责人：${name}，可用成员：${available.join(", ")}`);
    }
    return { ...member, id: member.user?.id ?? member.id };
  }

  private async resolveParentId(parent: string, projectId: string): Promise<string> {
    if (!parent.includes("-")) return parent;
    const item = await this.findByIdentifier(parent, projectId);
    if (!item) throw new Error(`未找到父工作项：${parent}`);
    return item.id;
  }

  private async resolveWorkItem(workItemId: string | undefined, identifier: string | undefined, schema: SchemaContext): Promise<WorkItem> {
    if (workItemId) {
      const page = await this.client.listWorkItems({
        project_ids: schema.project.id,
        type_ids: schema.type.id,
        page_index: 0,
        page_size: 100,
      });
      const item = page.values.find(value => value.id === workItemId);
      return item ?? { id: workItemId };
    }
    if (!identifier) throw new Error("必须提供 workItemId 或 identifier。");
    const item = await this.findByIdentifier(identifier, schema.project.id, schema.type.id);
    if (!item) throw new Error(`未找到工作项：${identifier}`);
    return item;
  }

  /** 解析单个工作项，拿到完整富字段；找不到直接抛错。workItemId 走详情端点，否则按编号解析。 */
  private async resolveWorkItemStrict(
    workItemId: string | undefined,
    identifier: string | undefined,
    schema: SchemaContext,
  ): Promise<WorkItem> {
    if (workItemId) {
      const item = await this.client.getWorkItem(workItemId);
      if (!item?.id) throw new Error(`未找到工作项：${workItemId}`);
      return item;
    }
    if (!identifier) throw new Error("必须提供 workItemId 或 identifier。");
    const item = await this.findByIdentifier(identifier, schema.project.id, schema.type.id);
    if (!item) throw new Error(`未找到工作项：${identifier}`);
    return item;
  }

  private async addCommentByWorkItemId(workItemId: string, content: string) {
    assertWritable(this.config);
    return this.client.createWorkItemComment(workItemId, content);
  }

  /** 统一 plan→execute：永远先算 plan（纯读）；dryRun 或无变化直接返回计划；写前单点 assertWritable，再执行。 */
  private async runMutation<TPlan, TResult>(
    dryRun: boolean,
    build: () => Promise<{ plan: TPlan; noChange: boolean; execute: () => Promise<TResult> }>,
  ): Promise<{ dryRun: boolean; plan: TPlan; noChange: boolean; executed?: TResult }> {
    const m = await build();
    if (dryRun || m.noChange) return { dryRun, plan: m.plan, noChange: m.noChange };
    assertWritable(this.config);
    const executed = await m.execute();
    return { dryRun, plan: m.plan, noChange: m.noChange, executed };
  }

  /** 校验当前状态保护条件；不匹配抛错。返回是否满足（无保护条件时为 undefined）。 */
  private assertExpectedStatus(item: WorkItem, expectedCurrentStatusName?: string): boolean | undefined {
    if (!expectedCurrentStatusName) return undefined;
    const currentStatus = item.state?.name;
    if (currentStatus !== expectedCurrentStatusName) {
      throw new Error(
        `当前状态不符合预期：${item.identifier ?? item.id} 当前为 ${currentStatus ?? "未知"}，预期为 ${expectedCurrentStatusName}`,
      );
    }
    return true;
  }

  /** 把目标字段值（名转 id）与当前值逐一比对，只产出真正变化的 PATCH 字段与 diff（不带 project_id/type_id）。 */
  private async buildFieldChanges(
    item: WorkItem,
    schema: SchemaContext,
    fields: {
      title?: string;
      description?: string;
      priorityName?: string;
      assigneeName?: string;
      parent?: string;
      properties?: Record<string, unknown>;
    },
  ): Promise<{ payload: WorkItemPayload; changes: FieldChange[] }> {
    const payload: WorkItemPayload = {};
    const changes: FieldChange[] = [];

    if (fields.title !== undefined && fields.title !== item.title) {
      payload.title = fields.title;
      changes.push({ field: "title", from: item.title, to: fields.title });
    }

    if (fields.description !== undefined && fields.description !== item.description) {
      payload.description = fields.description;
      changes.push({ field: "description", from: item.description, to: fields.description });
    }

    if (fields.priorityName !== undefined) {
      const priority = this.resolveNamed(fields.priorityName, schema.priorities, "优先级");
      if (priority.id !== item.priority?.id) {
        payload.priority_id = priority.id;
        changes.push({ field: "priority", from: item.priority?.name, to: priority.name });
      }
    }

    if (fields.assigneeName !== undefined) {
      const member = this.resolveMember(fields.assigneeName, schema.members);
      if (member.id !== item.assignee?.id) {
        payload.assignee_id = member.id;
        changes.push({ field: "assignee", from: item.assignee?.display_name ?? item.assignee?.name, to: fields.assigneeName });
      }
    }

    if (fields.parent !== undefined) {
      const parentId = await this.resolveParentId(fields.parent, schema.project.id);
      if (parentId !== item.parent?.id) {
        payload.parent_id = parentId;
        changes.push({ field: "parent", from: item.parent?.id, to: parentId });
      }
    }

    if (fields.properties !== undefined) {
      payload.properties = fields.properties;
      changes.push({ field: "properties", from: item.properties, to: fields.properties });
    }

    return { payload, changes };
  }
}

export function summarizeWorkItem(item: WorkItem, baseUrl: string) {
  const identifier = item.identifier;
  const imageSources = extractImageSources(item.description);
  return {
    id: item.id,
    identifier,
    title: item.title,
    state: item.state?.name,
    priority: item.priority?.name,
    assignee: item.assignee?.display_name ?? item.assignee?.name,
    imageCount: imageSources.length,
    imageSources,
    url: item.html_url ?? (identifier ? `${baseUrl}/pjm/work-items/${identifier}` : item.url),
  };
}

export function detailWorkItem(item: WorkItem, baseUrl: string, options: { includeImages?: boolean } = {}) {
  const summary = summarizeWorkItem(item, baseUrl);
  const includeImages = options.includeImages ?? true;
  return {
    ...summary,
    imageCount: includeImages ? summary.imageCount : 0,
    imageSources: includeImages ? summary.imageSources : [],
    description: item.description,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    parent: item.parent ? { id: item.parent.id, name: item.parent.name, identifier: item.parent.display_name } : undefined,
    properties: item.properties,
  };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/** 把 updatedAfter/updatedBefore（ISO 或 yyyy-MM-dd）映射为服务端 updated_between=<start>,<end>（10 位秒级时间戳，逗号分隔，缺失一侧留空）。 */
function buildUpdatedBetween(updatedAfter?: string, updatedBefore?: string): string | undefined {
  const start = toEpochSeconds(updatedAfter);
  const end = toEpochSeconds(updatedBefore);
  if (start === undefined && end === undefined) return undefined;
  return `${start ?? ""},${end ?? ""}`;
}

function toEpochSeconds(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new Error(`无法解析时间：${value}，请使用 ISO 8601 或 yyyy-MM-dd 格式。`);
  }
  return String(Math.floor(ms / 1000));
}

function extractImageSources(description: string | undefined): string[] {
  const sources: string[] = [];
  const imageTags = String(description ?? "").match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imageTags) {
    const match = tag.match(/\bsrc="([^"]+)"/i);
    if (match?.[1]) {
      sources.push(match[1]);
    }
  }
  return sources;
}
