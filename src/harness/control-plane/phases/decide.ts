import type { GuardGateReport } from "../../../outputs/guard-gates.js";
import type { HarnessDecision } from "../../types.js";
import { decideHarnessAction } from "../decision-engine.js";
import type { LoopControllerReport } from "../loop-controller.js";
import type { AgentExecutorResult, HarnessOrchestratorOptions } from "../orchestrator.js";
import type { PolicyEngineReport } from "../../verification-plane/policy-engine.js";

export interface DecidePhaseInput {
  executorResult: AgentExecutorResult;
  changedFiles: string[];
  policy: PolicyEngineReport;
  loop: LoopControllerReport;
  guardGates: GuardGateReport;
  checkpointMode: NonNullable<HarnessOrchestratorOptions["checkpoint"]>;
}

export interface DecidePhaseOutput {
  decision: HarnessDecision;
}

export function runDecidePhase(input: DecidePhaseInput): DecidePhaseOutput {
  return {
    decision: decideHarnessAction({
      executorResult: input.executorResult,
      changedFiles: input.changedFiles,
      policy: input.policy,
      loop: input.loop,
      guardGates: input.guardGates,
      checkpointMode: input.checkpointMode
    })
  };
}
