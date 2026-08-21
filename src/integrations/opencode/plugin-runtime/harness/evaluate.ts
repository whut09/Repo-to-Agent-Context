import { buildLoopControllerReport } from "../../../../harness/control-plane/loop-controller.js";
import { buildPolicyReport } from "../../../../harness/verification-plane/policy-engine.js";
import { runSidecarIncrementalVerifier } from "../../sidecar-incremental-verifier.js";
import { loadPluginHarnessContext } from "./context.js";
import { evaluateFindings, evaluateMissingEvidence, evaluateRequiredCommands } from "./findings.js";
import { createPluginHarnessResult } from "./protocol.js";
import { resolvePluginTask, taskRunExists, writePluginEvaluateState } from "./session.js";
import type { PluginEvaluateArgs, PluginEvaluateResult } from "./types.js";
import { readWorkflowState, updateWorkflowState } from "./workflow.js";

export async function evaluatePluginHarness(root: string, args: PluginEvaluateArgs = {}): Promise<PluginEvaluateResult | string> {
  const resolved = resolvePluginTask(root, args.taskId, args.sessionId);
  if (!resolved.taskId) return "evaluate needs a taskId or a previous prepare in this repository.";
  if (!taskRunExists(root, resolved.taskId)) return `evaluate could not find a task run for ${resolved.taskId}. Call prepare first.`;

  const workflow = resolved.sessionId ? readWorkflowState(root, resolved.sessionId) : undefined;
  if (resolved.source === "none" || (workflow && !workflow.taskId)) return "evaluate requires prepare before evaluating source changes.";
  const context = await loadPluginHarnessContext(root);
  const task = resolved.task ?? resolved.taskId;
  const guardStack = await runSidecarIncrementalVerifier(root, { base: "main", changedFiles: [] });
  const policy = buildPolicyReport(context, { base: "main", traceId: resolved.taskId, failOn: "required" });
  const loop = buildLoopControllerReport(context, task, { phase: "after-edit", base: "main", traceId: resolved.taskId });
  const result = createPluginHarnessResult(root, {
    ok: true,
    tool: "evaluate",
    summary: `Evaluate ${resolved.taskId}: ${Boolean(loop.decisions[0]?.blocking) || !policy.passed || !guardStack.passed ? "blocking" : "ready for next decision"}.`,
    taskId: resolved.taskId,
    sessionId: resolved.sessionId,
    taskIdSource: resolved.source,
    currentPhase: "evaluate",
    decision: loop.decisions[0]?.action ?? "ready-for-review",
    blocking: Boolean(loop.decisions[0]?.blocking) || !policy.passed || !guardStack.passed,
    findings: evaluateFindings({ policy, guardStack }),
    missingEvidence: evaluateMissingEvidence({ loop, policy }),
    requiredCommands: evaluateRequiredCommands({ loop, policy }),
    nextAction: "next",
    mustInspect: [],
    allowedEditGlobs: [],
    avoidEditGlobs: [],
    artifacts: [".agent-context/sidecar/plugin-evaluate.json", ".agent-context/sidecar/latest.json"]
  });
  if (resolved.sessionId)
    updateWorkflowState(root, resolved.sessionId, { phase: "evaluated", taskId: resolved.taskId, eventKey: `evaluate:${result.workingTreeHash}` });
  writePluginEvaluateState(root, {
    schemaVersion: result.schemaVersion,
    taskId: resolved.taskId,
    sessionId: result.sessionId,
    taskIdSource: result.taskIdSource,
    workingTreeHash: result.workingTreeHash,
    currentPhase: result.currentPhase,
    decision: result.decision,
    blocking: result.blocking,
    findings: result.findings,
    missingEvidence: result.missingEvidence,
    requiredCommands: result.requiredCommands,
    mustInspect: result.mustInspect,
    allowedEditGlobs: result.allowedEditGlobs,
    avoidEditGlobs: result.avoidEditGlobs,
    artifacts: result.artifacts,
    nextAction: result.nextAction,
    summary: result.summary,
    updatedAt: new Date().toISOString()
  });
  return result;
}
