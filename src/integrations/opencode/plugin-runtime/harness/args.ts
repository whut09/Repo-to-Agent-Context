import type { PluginEvaluateArgs, PluginHarnessTaskType, PluginNextArgs, PluginPrepareArgs, PluginRetrieveArgs } from "./types.js";

export function parsePrepareArgs(args: unknown): PluginPrepareArgs | string {
  const record = asRecord(args);
  const task = readNonEmptyString(record.task);
  if (!task) return "prepare requires a non-empty task.";
  const type = readTaskType(record.type);
  if (type === false) return 'prepare type must be "bugfix", "feature", or "refactor".';
  const sessionId = readOptionalSessionId(record.sessionId);
  return type ? { task, type, ...(sessionId ? { sessionId } : {}) } : { task, ...(sessionId ? { sessionId } : {}) };
}

export function parseRetrieveArgs(args: unknown): PluginRetrieveArgs | string {
  const record = asRecord(args);
  const task = readNonEmptyString(record.task);
  if (!task) return "retrieve requires a non-empty task.";
  const sessionId = readOptionalSessionId(record.sessionId);
  const taskType = readTaskType(record.taskType);
  if (taskType === false) return 'retrieve taskType must be "bugfix", "feature", or "refactor".';
  const contextId = readOptionalString(record.contextId);
  const file = readOptionalString(record.file);
  if (record.full !== undefined && typeof record.full !== "boolean") return "retrieve full must be boolean.";
  if (file && !contextId) return "retrieve file requires contextId.";
  if (file && record.full === true) return "retrieve file cannot be combined with full.";
  if (record.topK === undefined)
    return {
      task,
      ...(taskType ? { taskType } : {}),
      ...(contextId ? { contextId } : {}),
      ...(file ? { file } : {}),
      ...(record.full ? { full: true } : {}),
      ...(sessionId ? { sessionId } : {})
    };
  const topK = readPositiveInteger(record.topK);
  if (topK === undefined) return "retrieve topK must be a positive integer.";
  return {
    task,
    topK,
    ...(taskType ? { taskType } : {}),
    ...(contextId ? { contextId } : {}),
    ...(file ? { file } : {}),
    ...(record.full ? { full: true } : {}),
    ...(sessionId ? { sessionId } : {})
  };
}

export function parseEvaluateArgs(args: unknown): PluginEvaluateArgs | string {
  return parseOptionalTaskIdArgs(args, "evaluate");
}

export function parseNextArgs(args: unknown): PluginNextArgs | string {
  return parseOptionalTaskIdArgs(args, "next");
}

function parseOptionalTaskIdArgs(args: unknown, tool: "evaluate" | "next"): { taskId?: string; sessionId?: string | null } | string {
  const record = asRecord(args);
  const sessionId = readOptionalSessionId(record.sessionId);
  if (record.taskId === undefined) return sessionId ? { sessionId } : {};
  const taskId = readNonEmptyString(record.taskId);
  if (!taskId) return `${tool} taskId must be a non-empty string when provided.`;
  return { taskId, ...(sessionId ? { sessionId } : {}) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalSessionId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalString(value: unknown): string | undefined {
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
