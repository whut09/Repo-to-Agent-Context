import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { readJsonDiagnostic, writeJsonAtomic } from "../../../../core/atomic-store.js";
import { taskSlug } from "../../../../core/task-id.js";
import type { PluginEvaluateState, PluginHarnessSession, PluginTaskIdSource } from "./types.js";

export function pluginHarnessSessionPath(root: string, sessionId?: string | null): string {
  const suffix = sessionId?.trim() ? `-${taskSlug(sessionId.trim())}` : "";
  return path.join(root, ".agent-context", "sidecar", `plugin-session${suffix}.json`);
}

export function writePluginHarnessSession(root: string, session: PluginHarnessSession): void {
  writeJsonAtomic(pluginHarnessSessionPath(root, session.sessionId), session);
  writeJsonAtomic(pluginHarnessSessionPath(root), session);
}

export function readPluginHarnessSession(root: string, sessionId?: string | null): PluginHarnessSession | undefined {
  const direct = readSessionFile(pluginHarnessSessionPath(root, sessionId));
  if (direct) return direct;
  if (sessionId) return undefined;
  const directory = path.dirname(pluginHarnessSessionPath(root));
  if (!existsSync(directory)) return undefined;
  const candidates = readdirSync(directory)
    .filter((file) => /^plugin-session-.+\.json$/i.test(file))
    .map((file) => readSessionFile(path.join(directory, file)))
    .filter((value): value is PluginHarnessSession => Boolean(value))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return candidates[0];
}

function readSessionFile(filePath: string): PluginHarnessSession | undefined {
  const result = readJsonDiagnostic<PluginHarnessSession>(filePath);
  if (result.status !== "ok" || !result.value.taskId || !result.value.task) return undefined;
  return result.value;
}

export function pluginEvaluateStatePath(root: string): string {
  return path.join(root, ".agent-context", "sidecar", "plugin-evaluate.json");
}

export function writePluginEvaluateState(root: string, state: PluginEvaluateState): void {
  try {
    writeJsonAtomic(pluginEvaluateStatePath(root), state);
  } catch {
    // Best-effort persistence; the evaluate result is still returned to the model.
  }
}

export function readPluginEvaluateState(root: string): PluginEvaluateState | undefined {
  const result = readJsonDiagnostic<PluginEvaluateState>(pluginEvaluateStatePath(root));
  if (result.status !== "ok") return undefined;
  if (!result.value.taskId) return undefined;
  return result.value;
}

export function resolvePluginTask(
  root: string,
  taskId?: string,
  sessionId?: string | null
): { taskId?: string; task?: PluginHarnessSession["task"]; source: PluginTaskIdSource; sessionId: string | null } {
  const session = readPluginHarnessSession(root, sessionId);
  if (taskId?.trim()) {
    const normalized = taskSlug(taskId.trim());
    return { taskId: normalized, task: session?.taskId === normalized ? session.task : normalized, source: "argument", sessionId: sessionId ?? session?.sessionId ?? null };
  }
  return session ? { taskId: session.taskId, task: session.task, source: "session", sessionId: session.sessionId ?? null } : { source: "none", sessionId: sessionId ?? null };
}

export function resolvePluginTaskId(root: string, taskId?: string, sessionId?: string | null): string | undefined {
  return resolvePluginTask(root, taskId, sessionId).taskId;
}

export function taskRunManifestPath(root: string, taskId: string): string {
  return path.join(root, ".agent-context", "runs", taskId, "run.json");
}

export function taskRunExists(root: string, taskId: string): boolean {
  return existsSync(taskRunManifestPath(root, taskId));
}
