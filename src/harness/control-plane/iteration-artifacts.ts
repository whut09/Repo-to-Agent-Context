import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { AgentEvent } from "../../outputs/agent-events.js";
import type { GuardFindingsArtifact } from "../../outputs/guard-finding.js";
import type { GuardGateReport } from "../../outputs/guard-gates.js";
import { readExecutionTrace } from "../observability/execution-trace.js";
import { renderHallucinationReport, type HallucinationGuardReport } from "../verification-plane/guards/hallucination.js";
import { renderRegressionReport, type RegressionGuardReport } from "../verification-plane/guards/regression.js";
import type { PolicyEngineReport } from "../verification-plane/policy-engine.js";
import type { LoopControllerReport } from "./loop-controller.js";
import { HARNESS_DECISION_PRIORITY } from "./decision-engine.js";
import type { AgentExecutorResult, HarnessOrchestratorReport } from "./orchestrator.js";
import type { ConvergenceResult } from "./convergence.js";
import type { ContextRefreshMetrics } from "./context-refresh.js";
import { writeTextAtomic } from "../../core/atomic-store.js";

export interface IterationArtifactInput {
  runId: string;
  iteration: number;
  promptFile: string;
  executorResult: AgentExecutorResult;
  agentEvents: AgentEvent[];
  hallucination: HallucinationGuardReport;
  regression: RegressionGuardReport;
  policy: PolicyEngineReport;
  verify: string;
  loop: LoopControllerReport;
  decision: HarnessOrchestratorReport["decision"];
  convergence: ConvergenceResult;
  guardFindings: GuardFindingsArtifact;
  guardGates: GuardGateReport;
  contextRefresh: ContextRefreshMetrics;
}

export function writeIterationArtifacts(root: string, iterationDir: string, input: IterationArtifactInput): string[] {
  const generatedAt = new Date().toISOString();
  const trace = readExecutionTrace(root, input.runId);
  const executorArtifact = {
    schemaVersion: "opencode-plusplus.executor-result.v1",
    kind: "executor-result",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    summary: {
      executor: input.executorResult.executor,
      exitCode: input.executorResult.exitCode,
      command: input.executorResult.command,
      changedFiles: input.executorResult.changedFiles,
      events: input.executorResult.normalizedEventsCount ?? input.agentEvents.length,
      normalizerSource: input.executorResult.normalizerSource ?? "unknown",
      sandboxMode: input.executorResult.sandboxMode ?? "host"
    },
    executorResult: input.executorResult
  };
  const traceArtifact = {
    schemaVersion: "opencode-plusplus.trace-artifact.v1",
    kind: "trace",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    summary: {
      traceLoaded: Boolean(trace),
      steps: trace?.steps.length ?? 0,
      commandEvidence: trace?.steps.filter((step) => step.evidenceSource === "command").length ?? 0,
      filesTouched: [...new Set(trace?.steps.flatMap((step) => step.files) ?? [])].sort()
    },
    trace
  };
  const decisionArtifact = {
    schemaVersion: "opencode-plusplus.decision.v1",
    kind: "decision",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    priorityOrder: HARNESS_DECISION_PRIORITY,
    inputs: {
      executorExitCode: input.executorResult.exitCode,
      changedFiles: input.executorResult.changedFiles,
      policy: input.policy.summary,
      loopStatus: input.loop.status,
      loopRisk: input.loop.risk,
      guardFindings: input.guardFindings.summary,
      guardGates: input.guardGates.summary
    },
    convergence: input.convergence,
    contextPolicy: input.policy.contextPolicy,
    arbitration: input.decision.arbitration,
    decision: input.decision
  };
  const iterationArtifact = {
    schemaVersion: "opencode-plusplus.iteration.v1",
    kind: "iteration",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    directory: path.relative(root, iterationDir).replaceAll("\\", "/"),
    artifacts: {
      prompt: "prompt.md",
      executorEvents: "executor.events.jsonl",
      executorResult: "executor.result.json",
      diff: "diff.patch",
      trace: "trace.json",
      guardFindings: "guard.findings.json",
      guardGates: "guard.gates.json",
      policy: "policy.json",
      verify: "verify.json",
      loop: "loop.json",
      decision: "decision.json"
    },
    convergence: input.convergence,
    contextPolicy: input.policy.contextPolicy,
    summary: {
      executor: input.executorResult.executor,
      exitCode: input.executorResult.exitCode,
      changedFiles: input.executorResult.changedFiles.length,
      guardFindings: input.guardFindings.summary.total,
      guardGates: input.guardGates.summary.blocking,
      policyPassed: input.policy.passed,
      loopStatus: input.loop.status,
      decision: input.decision.action,
      selectedCandidate: input.decision.arbitration?.selectedCandidate.id,
      supportingCandidates: input.decision.arbitration?.supportingCandidates.length ?? 0,
      convergence: input.convergence.status,
      fingerprint: input.convergence.fingerprint.value,
      contextRefresh: input.contextRefresh
    }
  };
  const files = [
    input.promptFile,
    write(path.join(iterationDir, "iteration.json"), JSON.stringify(iterationArtifact, null, 2)),
    write(path.join(iterationDir, "executor.events.jsonl"), formatAgentEvents(input.agentEvents)),
    write(path.join(iterationDir, "executor.result.json"), JSON.stringify(executorArtifact, null, 2)),
    write(path.join(iterationDir, "hallucination.json"), JSON.stringify(input.hallucination, null, 2)),
    write(path.join(iterationDir, "hallucination.md"), renderHallucinationReport(input.hallucination)),
    write(path.join(iterationDir, "regression.json"), JSON.stringify(input.regression, null, 2)),
    write(path.join(iterationDir, "regression.md"), renderRegressionReport(input.regression)),
    write(path.join(iterationDir, "guard.findings.json"), JSON.stringify(input.guardFindings, null, 2)),
    write(path.join(iterationDir, "guard.gates.json"), JSON.stringify(input.guardGates, null, 2)),
    write(path.join(iterationDir, "policy.json"), JSON.stringify(input.policy, null, 2)),
    write(path.join(iterationDir, "verify.json"), JSON.stringify({ markdown: input.verify }, null, 2)),
    write(path.join(iterationDir, "loop.json"), JSON.stringify(input.loop, null, 2)),
    write(path.join(iterationDir, "decision.json"), JSON.stringify(decisionArtifact, null, 2)),
    write(path.join(iterationDir, "trace.json"), JSON.stringify(traceArtifact, null, 2))
  ];
  if (input.executorResult.diffPath) {
    const diffSource = path.join(root, input.executorResult.diffPath);
    const diffTarget = path.join(iterationDir, "diff.patch");
    if (existsSync(diffSource)) copyFileSync(diffSource, diffTarget);
    else writeTextAtomic(diffTarget, "");
    files.push(diffTarget);
  }
  return files;
}

function formatAgentEvents(events: AgentEvent[]): string {
  return events.length ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n` : "";
}

function write(filePath: string, content: string): string {
  writeTextAtomic(filePath, `${content.trim()}\n`);
  return filePath;
}
