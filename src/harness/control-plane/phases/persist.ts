import path from "node:path";
import type { GuardGateReport } from "../../../outputs/guard-gates.js";
import type { LoopControllerReport } from "../loop-controller.js";
import type { AgentExecutorResult, OrchestratorIterationReport } from "../orchestrator.js";
import type { PolicyEngineReport } from "../../verification-plane/policy-engine.js";
import type { HarnessDecision } from "../../types.js";
import type { ConvergenceResult } from "../convergence.js";
import type { ContextRefreshMetrics } from "../context-refresh.js";

export interface PersistPhaseInput {
  root: string;
  iteration: number;
  iterationDir: string;
  promptFile: string;
  executorResult: AgentExecutorResult;
  changedFiles: string[];
  policy: PolicyEngineReport;
  loop: LoopControllerReport;
  guardGates: GuardGateReport;
  decision: HarnessDecision;
  convergence: ConvergenceResult;
  contextRefresh: ContextRefreshMetrics;
  files: string[];
}

export interface PersistPhaseOutput {
  iterationReport: OrchestratorIterationReport;
}

export function runPersistPhase(input: PersistPhaseInput): PersistPhaseOutput {
  return {
    iterationReport: {
      index: input.iteration,
      dir: path.relative(input.root, input.iterationDir).replaceAll("\\", "/"),
      promptFile: path.relative(input.root, input.promptFile).replaceAll("\\", "/"),
      executorResult: input.executorResult,
      changedFiles: input.changedFiles,
      policy: { passed: input.policy.passed, failOn: input.policy.failOn, summary: input.policy.summary },
      contextPolicy: input.policy.contextPolicy,
      loop: {
        status: input.loop.status,
        risk: input.loop.risk,
        trace: input.loop.trace,
        checks: input.loop.checks,
        decisions: input.loop.decisions
      },
      gates: { summary: input.guardGates.summary, gates: input.guardGates.gates },
      decision: input.decision,
      convergence: input.convergence,
      interventionIds: input.decision.interventionIds,
      contextRefresh: input.contextRefresh,
      files: input.files.map((file) => path.relative(input.root, file).replaceAll("\\", "/"))
    }
  };
}
