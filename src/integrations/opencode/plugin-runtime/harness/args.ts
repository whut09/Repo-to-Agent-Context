import type { PluginEvaluateArgs, PluginHarnessTaskType, PluginNextArgs, PluginPrepareArgs, PluginRetrieveArgs } from "./types.js";

export function parsePrepareArgs(args: unknown): PluginPrepareArgs | string {
  const record = asRecord(args);
  const task = readNonEmptyString(record.task);
  if (!task) return "prepare requires a non-empty task.";
  const type = readTaskType(record.type);
  if (type === false) return 'prepare type must be "bugfix", "feature", or "refactor".';
  return type ? { task, type } : { task };
}

export function parseRetrieveArgs(args: unknown): PluginRetrieveArgs | string {
  const record = asRecord(args);
  const task = readNonEmptyString(record.task);
  if (!task) return "retrieve requires a non-empty task.";
  if (record.topK === undefined) return { task };
  const topK = readPositiveInteger(record.topK);
  if (topK === undefined) return "retrieve topK must be a positive integer.";
  return { task, topK };
}

export function parseEvaluateArgs(args: unknown): PluginEvaluateArgs | string {
  return parseOptionalTaskIdArgs(args, "evaluate");
}

export function parseNextArgs(args: unknown): PluginNextArgs | string {
  return parseOptionalTaskIdArgs(args, "next");
}

function parseOptionalTaskIdArgs(args: unknown, tool: "evaluate" | "next"): { taskId?: string } | string {
  const record = asRecord(args);
  if (record.taskId === undefined) return {};
  const taskId = readNonEmptyString(record.taskId);
  if (!taskId) return `${tool} taskId must be a non-empty string when provided.`;
  return { taskId };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readTaskType(value: unknown): PluginHarnessTaskType | undefined | false {
  if (value === undefined) return undefined;
  return value === "bugfix" || value === "feature" || value === "refactor" ? value : false;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (parsed > 0) return parsed;
  }
  return undefined;
}
