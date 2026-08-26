import type { ContextPackage, EvidencePolicyMode, TaskType } from "../../../core/types.js";
import { buildGuardFindingsArtifact, type GuardFindingsArtifact } from "../../../outputs/guard-finding.js";
import { buildGuardGateReport, type GuardGateReport } from "../../../outputs/guard-gates.js";
import { renderTaskVerify } from "../../../outputs/task-harness.js";
import { readExecutionTrace } from "../../observability/execution-trace.js";
import { buildHallucinationReport, writeHallucinationReport, type HallucinationGuardReport } from "../../verification-plane/guards/hallucination.js";
import { buildRegressionReport, writeRegressionReport, type RegressionGuardReport } from "../../verification-plane/guards/regression.js";
import { buildPolicyReport, type PolicyEngineReport, type PolicyFailOn } from "../../verification-plane/policy-engine.js";
import { buildLoopControllerReport, type LoopControllerReport } from "../loop-controller.js";

export interface EvaluatePhaseInput {
  context: ContextPackage;
  hostRoot: string;
  task: string;
  runId: string;
  iteration: number;
  base: string;
  previousAction?: string;
  type: TaskType;
  tokenBudget?: number;
  failOn: PolicyFailOn;
  evidencePolicy: EvidencePolicyMode;
  changedFiles: string[];
  checkpointMode: "none" | "git-worktree";
}

export interface EvaluatePhaseOutput {
  hallucination: HallucinationGuardReport;
  regression: RegressionGuardReport;
  policy: PolicyEngineReport;
  verify: string;
  loop: LoopControllerReport;
  guardFindings: GuardFindingsArtifact;
  guardGates: GuardGateReport;
}

export function runEvaluatePhase(input: EvaluatePhaseInput): EvaluatePhaseOutput {
  const hallucination = buildHallucinationReport(input.context, { base: input.base, traceId: input.runId, task: input.task });
  writeHallucinationReport(input.context, hallucination);
  const regression = buildRegressionReport(input.context, {
    base: input.base,
    traceId: input.runId,
    task: input.task,
    evidencePolicy: input.evidencePolicy
  });
  writeRegressionReport(input.context, regression);
  const policy = buildPolicyReport(input.context, {
    base: input.base,
    traceId: input.runId,
    failOn: input.failOn,
    evidencePolicy: input.evidencePolicy,
    contextTaskId: input.runId
  });
  const verify = renderTaskVerify(input.context, { base: input.base, diff: true });
  const loop = buildLoopControllerReport(input.context, input.task, {
    phase: input.iteration === 1 ? "after-edit" : input.previousAction === "repair" ? "repair" : "after-edit",
    base: input.base,
    type: input.type,
    tokenBudget: input.tokenBudget,
    traceId: input.runId,
    evidencePolicy: input.evidencePolicy
  });
  const guardFindings = buildGuardFindingsArtifact({
    runId: input.runId,
    iteration: input.iteration,
    policy,
    hallucination,
    regression
  });
  const guardGates = buildGuardGateReport({
    runId: input.runId,
    iteration: input.iteration,
    policy,
    loop,
    guardFindings,
    trace: readExecutionTrace(input.hostRoot, input.runId),
    changedFiles: input.changedFiles,
    checkpointMode: input.checkpointMode
  });
  return { hallucination, regression, policy, verify, loop, guardFindings, guardGates };
}
