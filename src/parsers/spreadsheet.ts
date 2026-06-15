import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

export interface ImportRow {
  rowNumber: number;
  identifier?: string;
  title?: string;
  statusName?: string;
  priorityName?: string;
  assigneeName?: string;
  parent?: string;
  requirementType?: string;
  createdAt?: string;
  description?: string;
  extraColumns: Record<string, string>;
  raw: Record<string, string>;
}

export interface SpreadsheetParseResult {
  filePath: string;
  sheetName: string;
  rows: ImportRow[];
}

const HEADER_ALIASES: Record<keyof Omit<ImportRow, "rowNumber" | "extraColumns" | "raw">, string[]> = {
  identifier: ["编号", "ID", "id", "identifier", "工作项编号"],
  title: ["标题", "名称", "需求标题", "缺陷标题", "title"],
  statusName: ["状态", "当前状态", "status"],
  priorityName: ["优先级", "优先程度", "priority"],
  assigneeName: ["负责人", "处理人", "经办人", "assignee"],
  parent: ["父工作项", "父级", "父需求", "父缺陷", "parent"],
  requirementType: ["需求类型", "类型", "需求类别", "type"],
  createdAt: ["创建时间", "创建日期", "created_at"],
  description: ["描述", "详情", "说明", "备注", "description"],
};

export async function readSpreadsheet(filePath: string, sheetName?: string): Promise<SpreadsheetParseResult> {
  const absolutePath = path.resolve(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`导入文件不存在：${absolutePath}`);
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const { rows: rawRows, selectedSheet } =
    ext === ".csv" ? readCsvRows(absolutePath) : await readXlsxRows(absolutePath, sheetName);

  return {
    filePath: absolutePath,
    sheetName: selectedSheet,
    rows: rawRows.map((row, index) => normalizeRow(row, index + 2)),
  };
}

function readCsvRows(filePath: string): { selectedSheet: string; rows: Record<string, unknown>[] } {
  const content = readFileSync(filePath, "utf8");
  const rows = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];
  return { selectedSheet: "CSV", rows };
}

async function readXlsxRows(
  filePath: string,
  sheetName?: string,
): Promise<{ selectedSheet: string; rows: Record<string, unknown>[] }> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".xlsx") {
    throw new Error(`暂不支持 ${ext}，请使用 .xlsx 或 .csv。`);
  }

  const rows = sheetName ? await readSheet(filePath, sheetName) : await readSheet(filePath);
  if (rows.length === 0) {
    return { selectedSheet: sheetName ?? "Sheet1", rows: [] };
  }

  const [headers, ...bodyRows] = rows;
  const normalizedHeaders = headers.map(header => stringifyCell(header).trim());
  const records = bodyRows
    .filter(row => row.some(cell => stringifyCell(cell).trim() !== ""))
    .map(row =>
      Object.fromEntries(
        normalizedHeaders.map((header, index) => [header || `column_${index + 1}`, stringifyCell(row[index])]),
      ),
    );

  return { selectedSheet: sheetName ?? "Sheet1", rows: records };
}

function normalizeRow(row: Record<string, unknown>, rowNumber: number): ImportRow {
  const normalizedRaw = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key).trim(), stringifyCell(value)]),
  );
  const result: ImportRow = {
    rowNumber,
    extraColumns: {},
    raw: normalizedRaw,
  };

  const usedHeaders = new Set<string>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[keyof typeof HEADER_ALIASES, string[]]>) {
    const header = Object.keys(normalizedRaw).find(key => aliases.some(alias => sameHeader(key, alias)));
    if (header) {
      usedHeaders.add(header);
      const value = normalizedRaw[header]?.trim();
      if (value) {
        result[field] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(normalizedRaw)) {
    if (!usedHeaders.has(key) && value !== "") {
      result.extraColumns[key] = value;
    }
  }

  return result;
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function sameHeader(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
