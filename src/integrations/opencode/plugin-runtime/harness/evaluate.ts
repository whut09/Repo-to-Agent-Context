import { buildLoopControllerReport } from "../../../../harness/control-plane/loop-controller.js";
import { buildPolicyReport } from "../../../../harness/verification-plane/policy-engine.js";
import { runSidecarIncrementalVerifier } from "../../sidecar-incremental-verifier.js";
import { loadPluginHarnessContext } from "./context.js";
import { evaluateFindings, evaluateMissingEvidence, evaluateRequiredCommands } from "./findings.js";
import { readPluginHarnessSession, resolvePluginTaskId, taskRunExists, writePluginEvaluateState } from "./session.js";
import type { PluginEvaluateArgs, PluginEvaluateResult } from "./types.js";

export async function evaluatePluginHarness(root: string, args: PluginEvaluateArgs = {}): Promise<PluginEvaluateResult | string> {
  const session = readPluginHarnessSession(root);
  const taskId = resolvePluginTaskId(root, args.taskId);
  if (!taskId) return "evaluate needs a taskId or a previous prepare in this repository.";
  if (!taskRunExists(root, taskId)) return `evaluate could not find a task run for ${taskId}. Call prepare first.`;

  const context = await loadPluginHarnessContext(root);
  const task = session?.task && session.taskId === taskId ? session.task : taskId;
  const guardStack = await runSidecarIncrementalVerifier(root, { base: "main", changedFiles: [] });
  const policy = buildPolicyReport(context, { base: "main", traceId: taskId, failOn: "required" });
  const loop = buildLoopControllerReport(context, task, { phase: "after-edit", base: "main", traceId: taskId });
  const result: PluginEvaluateResult = {
    taskId,
    blocking: Boolean(loop.decisions[0]?.blocking) || !policy.passed || !guardStack.passed,
    decision: loop.decisions[0]?.action ?? "ready-for-review",
    findings: evaluateFindings({ policy, guardStack }),
    missingEvidence: evaluateMissingEvidence({ loop, policy }),
    requiredCommands: evaluateRequiredCommands({ loop, policy })
  };
  writePluginEvaluateState(root, {
    taskId: result.taskId,
    blocking: result.blocking,
    decision: result.decision,
    missingEvidence: result.missingEvidence,
    requiredCommands: result.requiredCommands,
    updatedAt: new Date().toISOString()
  });
  return result;
}
