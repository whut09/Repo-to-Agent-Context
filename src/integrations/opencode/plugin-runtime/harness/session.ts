import { existsSync } from "node:fs";
import path from "node:path";
import { readJsonDiagnostic, writeJsonAtomic } from "../../../../core/atomic-store.js";
import { taskSlug } from "../../../../core/task-id.js";
import type { PluginEvaluateState, PluginHarnessSession } from "./types.js";

export function pluginHarnessSessionPath(root: string): string {
  return path.join(root, ".agent-context", "sidecar", "plugin-session.json");
}

export function writePluginHarnessSession(root: string, session: PluginHarnessSession): void {
  writeJsonAtomic(pluginHarnessSessionPath(root), session);
}

export function readPluginHarnessSession(root: string): PluginHarnessSession | undefined {
  const result = readJsonDiagnostic<PluginHarnessSession>(pluginHarnessSessionPath(root));
  if (result.status !== "ok") return undefined;
  if (!result.value.taskId || !result.value.task) return undefined;
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

export function resolvePluginTaskId(root: string, taskId?: string): string | undefined {
  if (taskId?.trim()) return taskSlug(taskId.trim());
  return readPluginHarnessSession(root)?.taskId;
}

export function taskRunManifestPath(root: string, taskId: string): string {
  return path.join(root, ".agent-context", "runs", taskId, "run.json");
}

export function taskRunExists(root: string, taskId: string): boolean {
  return existsSync(taskRunManifestPath(root, taskId));
}
