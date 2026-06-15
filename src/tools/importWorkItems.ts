import type { PingCodeConfig } from "../config.js";
import { assertWritable } from "../config.js";
import { readSpreadsheet } from "../parsers/spreadsheet.js";
import type { ImportRow } from "../parsers/spreadsheet.js";
import type { WorkItemPayload } from "../pingcode/types.js";
import { summarizeWorkItem, WorkItemService } from "../pingcode/workItemService.js";
import type { WorkItemKind } from "../pingcode/workItemService.js";

export interface ImportOptions {
  kind: WorkItemKind;
  filePath: string;
  sheetName?: string;
  mode?: "create" | "update" | "upsert";
  dryRun?: boolean;
  maxRows?: number;
  projectIdentifier?: string;
  projectId?: string;
}

interface PlannedOperation {
  rowNumber: number;
  operation: "create" | "update" | "skip" | "error";
  identifier?: string;
  title?: string;
  payload?: WorkItemPayload;
  reason?: string;
  extraColumns?: Record<string, string>;
}

export async function importWorkItems(config: PingCodeConfig, options: ImportOptions) {
  const dryRun = options.dryRun ?? true;
  const mode = options.mode ?? "upsert";
  const maxRows = options.maxRows ?? 100;
  const parsed = await readSpreadsheet(options.filePath, options.sheetName);
  const rows = parsed.rows.slice(0, maxRows);
  const service = new WorkItemService(config);
  const schema = await service.getKindSchema(options.kind, {
    projectIdentifier: options.projectIdentifier,
    projectId: options.projectId,
  });

  const planned: PlannedOperation[] = [];
  for (const row of rows) {
    planned.push(await planRow(service, options.kind, schema.project.id, schema.type.id, row, mode));
  }

  const result = {
    dryRun,
    mode,
    filePath: parsed.filePath,
    sheetName: parsed.sheetName,
    totalRows: parsed.rows.length,
    processedRows: rows.length,
    schema: {
      project: schema.project,
      type: schema.type,
    },
    planned,
    executed: [] as unknown[],
  };

  if (dryRun) return result;
  assertWritable(config);

  for (const operation of planned) {
    if (operation.operation === "create" && operation.payload) {
      const created = await service.create(operation.payload);
      result.executed.push({ rowNumber: operation.rowNumber, operation: "create", item: summarizeWorkItem(created, config.baseUrl) });
    } else if (operation.operation === "update" && operation.payload && operation.identifier) {
      const item = await service.findByIdentifier(operation.identifier, schema.project.id, schema.type.id);
      if (!item) {
        result.executed.push({ rowNumber: operation.rowNumber, operation: "error", error: "执行时未找到待更新工作项" });
      } else {
        const updated = await service.update(item.id, withoutCreateOnlyFields(operation.payload));
        result.executed.push({ rowNumber: operation.rowNumber, operation: "update", item: summarizeWorkItem(updated, config.baseUrl) });
      }
    }
  }

  return result;
}

async function planRow(
  service: WorkItemService,
  kind: WorkItemKind,
  projectId: string,
  typeId: string,
  row: ImportRow,
  mode: "create" | "update" | "upsert",
): Promise<PlannedOperation> {
  try {
    if (!row.title && mode !== "update") {
      return errorPlan(row, "缺少标题，无法创建工作项。");
    }

    const schema = await service.getKindSchema(kind, { projectId, typeId });
    const existing = row.identifier ? await service.findByIdentifier(row.identifier, projectId, typeId) : undefined;

    if (mode === "update" && !row.identifier) {
      return errorPlan(row, "更新模式必须提供编号。");
    }
    if (mode === "update" && !existing) {
      return errorPlan(row, `未找到编号为 ${row.identifier} 的工作项。`);
    }
    if (mode === "create" && existing) {
      return {
        rowNumber: row.rowNumber,
        operation: "skip",
        identifier: row.identifier,
        title: row.title,
        reason: "创建模式下发现同编号工作项，跳过。",
        extraColumns: row.extraColumns,
      };
    }

    const payload = await service.buildPayload(kind, row, schema);
    const operation = existing ? "update" : "create";
    return {
      rowNumber: row.rowNumber,
      operation,
      identifier: row.identifier ?? existing?.identifier,
      title: row.title,
      payload,
      extraColumns: row.extraColumns,
    };
  } catch (error) {
    return errorPlan(row, error instanceof Error ? error.message : String(error));
  }
}

function errorPlan(row: ImportRow, reason: string): PlannedOperation {
  return {
    rowNumber: row.rowNumber,
    operation: "error",
    identifier: row.identifier,
    title: row.title,
    reason,
    extraColumns: row.extraColumns,
  };
}

function withoutCreateOnlyFields(payload: WorkItemPayload): WorkItemPayload {
  const { project_id: _projectId, type_id: _typeId, ...rest } = payload;
  return rest;
}
