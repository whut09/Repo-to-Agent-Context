import { unique } from "../../../../core/collections.js";
import { buildLoopControllerReport } from "../../../../harness/control-plane/loop-controller.js";
import { completionRuleFor } from "./completion.js";
import { loadPluginHarnessContext } from "./context.js";
import { readPluginHarnessSession, resolvePluginTaskId, taskRunExists } from "./session.js";
import type { PluginNextArgs, PluginNextResult } from "./types.js";

export async function nextPluginHarnessAction(root: string, args: PluginNextArgs = {}): Promise<PluginNextResult | string> {
  const session = readPluginHarnessSession(root);
  const taskId = resolvePluginTaskId(root, args.taskId);
  if (!taskId) return "next needs a taskId or a previous prepare in this repository.";
  if (!taskRunExists(root, taskId)) return `next could not find a task run for ${taskId}. Call prepare first.`;

  const context = await loadPluginHarnessContext(root);
  const task = session?.task && session.taskId === taskId ? session.task : taskId;
  const loop = buildLoopControllerReport(context, task, { phase: "after-edit", base: "main", traceId: taskId });
  const decision = loop.decisions[0];
  const nextAction = decision?.action ?? "ready-for-review";
  const blocking = Boolean(decision?.blocking);
  return {
    taskId,
    nextAction,
    blocking,
    missingEvidence: unique(loop.runtime.missingEvidence),
    requiredCommands: unique(loop.decisions.map((item) => item.command).filter((command): command is string => Boolean(command))),
    completionRule: completionRuleFor(nextAction, blocking)
  };
}
