import { startApplicationTask } from "../../../../application/task-service.js";
import { taskSlug } from "../../../../core/task-id.js";
import { loadPluginHarnessContext } from "./context.js";
import { writePluginHarnessSession } from "./session.js";
import type { PluginPrepareArgs, PluginPrepareResult } from "./types.js";

export async function preparePluginHarnessTask(root: string, args: PluginPrepareArgs): Promise<PluginPrepareResult> {
  await loadPluginHarnessContext(root);
  const started = await startApplicationTask({
    repo: root,
    task: args.task,
    type: args.type ?? "auto"
  });
  const manifest = started.manifest;
  const taskId = manifest.id || taskSlug(args.task);
  writePluginHarnessSession(root, {
    taskId,
    task: args.task,
    type: args.type ?? "auto",
    updatedAt: new Date().toISOString()
  });
  return {
    taskId,
    task: args.task,
    type: manifest.type,
    mustInspect: manifest.mustInspect,
    allowedEditGlobs: manifest.allowedEditGlobs,
    avoidEditGlobs: manifest.avoidEditGlobs,
    requiredCommands: manifest.requiredCommands,
    nextStep: "Read mustInspect source files, stay inside allowedEditGlobs, then call opencode_plusplus_evaluate."
  };
}
