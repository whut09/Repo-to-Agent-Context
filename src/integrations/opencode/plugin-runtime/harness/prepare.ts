import { startApplicationTask } from "../../../../application/task-service.js";
import { readJsonDiagnostic } from "../../../../core/atomic-store.js";
import { taskSlug } from "../../../../core/task-id.js";
import type { TaskRunManifest } from "../../../../outputs/task-run.js";
import { loadPluginHarnessContext } from "./context.js";
import { taskRunManifestPath, writePluginHarnessSession } from "./session.js";
import { createPluginHarnessResult } from "./protocol.js";
import type { PluginPrepareArgs, PluginPrepareResult } from "./types.js";

export async function preparePluginHarnessTask(root: string, args: PluginPrepareArgs): Promise<PluginPrepareResult> {
  await loadPluginHarnessContext(root);
  const taskId = taskSlug(args.task);
  const existing = readJsonDiagnostic<TaskRunManifest>(taskRunManifestPath(root, taskId));
  const manifest =
    existing.status === "ok" && existing.value.id === taskId
      ? existing.value
      : (await startApplicationTask({ repo: root, task: args.task, type: args.type ?? "auto" })).manifest;
  const resolvedTaskId = manifest.id || taskId;
  writePluginHarnessSession(root, {
    taskId: resolvedTaskId,
    task: args.task,
    type: args.type ?? "auto",
    sessionId: args.sessionId ?? null,
    updatedAt: new Date().toISOString()
  });
  const artifacts = manifest.files ?? [];
  return createPluginHarnessResult(root, {
    ok: true,
    tool: "prepare",
    summary: `Prepared ${resolvedTaskId}. Read mustInspect, edit only allowedEditGlobs, then evaluate.`,
    taskId: resolvedTaskId,
    sessionId: args.sessionId ?? null,
    taskIdSource: "created",
    currentPhase: "prepare",
    decision: "needs-inspection",
    blocking: true,
    findings: ["Prepare is not completion evidence; evaluate and next are required."],
    nextAction: "evaluate",
    mustInspect: manifest.mustInspect,
    allowedEditGlobs: manifest.allowedEditGlobs,
    avoidEditGlobs: manifest.avoidEditGlobs,
    requiredCommands: manifest.requiredCommands,
    artifacts
  });
}
