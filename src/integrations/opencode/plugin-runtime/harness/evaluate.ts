import { buildLoopControllerReport } from "../../../../harness/control-plane/loop-controller.js";
import { buildPolicyReport } from "../../../../harness/verification-plane/policy-engine.js";
import { resolveGitBase } from "../../../../core/git.js";
import { traceIdForOpenCodeSession } from "../../sidecar-evidence-recorder.js";
import { runSidecarIncrementalVerifier } from "../../sidecar-incremental-verifier.js";
import { loadPluginHarnessContext } from "./context.js";
import { evaluateFindings, evaluateMissingEvidence, evaluateRequiredCommands } from "./findings.js";
import { createPluginHarnessResult } from "./protocol.js";
import { resolvePluginTask, taskRunExists, writePluginEvaluateState } from "./session.js";
import type { PluginEvaluateArgs, PluginEvaluateResult } from "./types.js";
import { readWorkflowState, updateWorkflowState } from "./workflow.js";
import { createPluginHarnessError } from "./protocol.js";
import { cacheStatusForStats, contextModeForStats, pluginPerformance, runPluginStage } from "./performance.js";
import { pluginInterventionSnapshot, recordPluginEvaluationInterventions } from "./interventions.js";
import { readExecutionTrace } from "../../../../harness/observability/execution-trace.js";
import { blockersFromGuardStack } from "../../sidecar-incremental-verifier.js";

export async function evaluatePluginHarness(root: string, args: PluginEvaluateArgs = {}): Promise<PluginEvaluateResult | string> {
  const staged = await runPluginStage("evaluate", () => evaluatePluginHarnessInternal(root, args));
  if (staged.status === "timeout") {
    return createPluginHarnessError(
      root,
      "evaluate",
      `evaluate exceeded the ${5000}ms Desktop target; inspect the returned artifacts and retry.`,
      args.taskId ?? null,
      args.sessionId ?? null,
      args.taskId ? "argument" : "none",
      pluginPerformance("evaluate", staged, "miss", "rebuilt", [], [])
    );
  }
  const result = staged.value!;
  if (typeof result === "string") return result;
  return {
    ...result,
    performance: pluginPerformance(
      "evaluate",
      staged,
      result.performance?.cache ?? "miss",
      result.performance?.contextMode ?? "rebuilt",
      result.performance?.selectedFiles ?? [],
      result.performance?.rejectedFiles ?? []
    )
  };
}

async function evaluatePluginHarnessInternal(root: string, args: PluginEvaluateArgs = {}): Promise<PluginEvaluateResult | string> {
  const resolved = resolvePluginTask(root, args.taskId, args.sessionId);
  if (!resolved.taskId) return "evaluate needs a taskId or a previous prepare in this repository.";
  if (!taskRunExists(root, resolved.taskId)) return `evaluate could not find a task run for ${resolved.taskId}. Call prepare first.`;

  const workflow = resolved.sessionId ? readWorkflowState(root, resolved.sessionId) : undefined;
  if (resolved.source === "none" || (workflow && !workflow.taskId)) return "evaluate requires prepare before evaluating source changes.";
  const context = await loadPluginHarnessContext(root);
  const task = resolved.task ?? resolved.taskId;
  const base = resolveGitBase(root);
  const guardStack = await runSidecarIncrementalVerifier(root, { base, changedFiles: [] });
  const traceId = traceIdForOpenCodeSession(resolved.sessionId);
  const policy = buildPolicyReport(context, { base, traceId, failOn: "required", contextTaskId: resolved.taskId });
  const loop = buildLoopControllerReport(context, task, { phase: "after-edit", base, traceId });
  const trace = readExecutionTrace(root, traceId);
  const decision = loop.decisions[0]?.action ?? "ready-for-review";
  recordPluginEvaluationInterventions({
    root,
    taskId: resolved.taskId,
    sessionId: resolved.sessionId,
    policy,
    guardStack,
    blockers: blockersFromGuardStack(guardStack),
    decision,
    trace,
    changedFiles: policy.changedFiles
  });
  const interventions = pluginInterventionSnapshot(root, resolved.taskId, policy.changedFiles, []);
  const result = createPluginHarnessResult(root, {
    ok: true,
    tool: "evaluate",
    summary: `Evaluate ${resolved.taskId}: ${Boolean(loop.decisions[0]?.blocking) || !policy.passed || !guardStack.passed ? "blocking" : "ready for next decision"}.`,
    taskId: resolved.taskId,
    sessionId: resolved.sessionId,
    taskIdSource: resolved.source,
    currentPhase: "evaluate",
    decision,
    blocking: Boolean(loop.decisions[0]?.blocking) || !policy.passed || !guardStack.passed,
    findings: evaluateFindings({ policy, guardStack }),
    missingEvidence: evaluateMissingEvidence({ loop, policy }),
    requiredCommands: evaluateRequiredCommands({ loop, policy }),
    nextAction: "next",
    mustInspect: [],
    allowedEditGlobs: [],
    avoidEditGlobs: [],
    artifacts: [".agent-context/sidecar/plugin-evaluate.json", ".agent-context/sidecar/latest.json"],
    interventions,
    performance: pluginPerformance(
      "evaluate",
      { status: "completed", durationMs: 0 },
      cacheStatusForStats(context.cacheStats),
      contextModeForStats(context.cacheStats),
      [],
      []
    )
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
    interventions: result.interventions,
    updatedAt: new Date().toISOString()
  });
  return result;
}
