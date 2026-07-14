import type { ExecutionTrace } from "../harness/observability/execution-trace.js";
import type { GuardFindingsArtifact } from "./guard-finding.js";
import type { LoopControllerReport } from "../harness/control-plane/loop-controller.js";
import type { PolicyEngineReport } from "../harness/verification-plane/policy-engine.js";
import { latestTestResultSteps, testStepFailedByExitCode, testStepHasFailureOutput } from "./evidence.js";

export type GuardGateName = "context" | "boundary" | "evidence" | "hallucination" | "regression";
export type GuardGateAction = "repack" | "expand-context" | "rollback" | "human-review" | "run-tests" | "repair" | "block" | "run-regression-tests";
export type GuardGateSeverity = "blocker" | "warning" | "passed";

export interface GuardGate {
  id: string;
  guard: GuardGateName;
  condition: string;
  status: "blocked" | "warning" | "passed";
  severity: GuardGateSeverity;
  action: GuardGateAction;
  evidence: string[];
  findingIds: string[];
}

export interface GuardGateReport {
  schemaVersion: "opencode-plusplus.guard-gates.v1";
  kind: "guard-gates";
  generatedAt: string;
  runId: string;
  iteration: number;
  gates: GuardGate[];
  summary: {
    total: number;
    blocking: number;
    warnings: number;
    passed: number;
    byGuard: Record<GuardGateName, { blocking: number; warnings: number; passed: number }>;
  };
}

export function buildGuardGateReport(input: {
  runId: string;
  iteration: number;
  policy: PolicyEngineReport;
  loop: LoopControllerReport;
  guardFindings: GuardFindingsArtifact;
  trace?: ExecutionTrace | null;
  changedFiles: string[];
  checkpointMode: "none" | "git-worktree";
}): GuardGateReport {
  const gates = [
    ...contextGates(input.policy, input.loop),
    ...boundaryGates(input.policy, input.changedFiles, input.checkpointMode),
    ...evidenceGates(input.policy, input.loop, input.trace),
    ...hallucinationGates(input.guardFindings),
    ...regressionGates(input.guardFindings, input.policy)
  ];
  const normalized = gates.length
    ? gates
    : [passedGate("context.passed", "context", "No guard gate blockers detected.", "repack", ["Policy and loop checks produced no guard blockers."])];

  return {
    schemaVersion: "opencode-plusplus.guard-gates.v1",
    kind: "guard-gates",
    generatedAt: new Date().toISOString(),
    runId: input.runId,
    iteration: input.iteration,
    gates: normalized,
    summary: summarizeGates(normalized)
  };
}

function contextGates(policy: PolicyEngineReport, loop: LoopControllerReport): GuardGate[] {
  const gates: GuardGate[] = [];
  const contextRefresh = policy.results.find((finding) => finding.id === "policy.required.context-refresh" && finding.status === "missing");
  if (contextRefresh || loop.context.freshness !== "fresh" || loop.context.drift !== "clean") {
    gates.push({
      id: "context.stale",
      guard: "context",
      condition: "context stale",
      status: "blocked",
      severity: "blocker",
      action: "repack",
      evidence: [`freshness: ${loop.context.freshness}`, `drift: ${loop.context.drift}`, ...(contextRefresh?.evidence ?? [])],
      findingIds: contextRefresh ? [contextRefresh.id] : []
    });
  }

  const replan = loop.decisions.find((decision) => decision.action === "replan");
  if (replan || loop.context.taskPackTokens > loop.context.taskPackBudget) {
    gates.push({
      id: "context.token-budget",
      guard: "context",
      condition: "context token budget exceeded",
      status: "blocked",
      severity: "blocker",
      action: "repack",
      evidence: [`task pack tokens: ${loop.context.taskPackTokens}`, `task pack budget: ${loop.context.taskPackBudget}`, ...(replan?.signals ?? [])],
      findingIds: []
    });
  }

  return gates;
}

function boundaryGates(policy: PolicyEngineReport, changedFiles: string[], checkpointMode: "none" | "git-worktree"): GuardGate[] {
  const gates: GuardGate[] = [];
  const forbidden = policy.results.filter((finding) => finding.kind === "forbidden" && finding.status === "failed");
  if (forbidden.length) {
    gates.push({
      id: "boundary.forbidden-path",
      guard: "boundary",
      condition: "changed forbidden path",
      status: "blocked",
      severity: "blocker",
      action: checkpointMode === "git-worktree" ? "rollback" : "block",
      evidence: forbidden.flatMap((finding) => [finding.file ? `file: ${finding.file}` : finding.message, ...finding.evidence]).slice(0, 12),
      findingIds: forbidden.map((finding) => finding.id)
    });
  }

  if (policy.generatedContextFiles.length) {
    gates.push({
      id: "boundary.generated-context",
      guard: "boundary",
      condition: "changed generated .agent-context files",
      status: "warning",
      severity: "warning",
      action: "human-review",
      evidence: policy.generatedContextFiles.slice(0, 12),
      findingIds: []
    });
  }

  const protectedFindings = policy.results.filter((finding) => /lockfile|migration|ci|deploy|contract|protected/i.test(`${finding.id} ${finding.message}`));
  if (protectedFindings.some((finding) => finding.status === "failed" || finding.status === "warning")) {
    gates.push({
      id: "boundary.protected-change",
      guard: "boundary",
      condition: "changed lockfile / CI / migration without explicit permission",
      status: protectedFindings.some((finding) => finding.status === "failed") ? "blocked" : "warning",
      severity: protectedFindings.some((finding) => finding.status === "failed") ? "blocker" : "warning",
      action: protectedFindings.some((finding) => finding.status === "failed") ? (checkpointMode === "git-worktree" ? "rollback" : "block") : "human-review",
      evidence: protectedFindings.flatMap((finding) => [finding.file ? `file: ${finding.file}` : finding.message, ...finding.evidence]).slice(0, 12),
      findingIds: protectedFindings.map((finding) => finding.id)
    });
  }

  const largeDiff = policy.results.find((finding) => finding.id === "policy.risk.large-diff");
  if (largeDiff || changedFiles.length >= 10) {
    gates.push({
      id: "boundary.diff-too-large",
      guard: "boundary",
      condition: "diff too large",
      status: "warning",
      severity: "warning",
      action: "human-review",
      evidence: [`changed files: ${changedFiles.length}`, ...(largeDiff?.evidence ?? [])],
      findingIds: largeDiff ? [largeDiff.id] : []
    });
  }

  return gates;
}

function evidenceGates(policy: PolicyEngineReport, loop: LoopControllerReport, trace: ExecutionTrace | null | undefined): GuardGate[] {
  const gates: GuardGate[] = [];
  const latestTestResults = trace ? latestTestResultSteps(trace, { afterLastEdit: true }) : [];
  const testFinding = policy.results.find((finding) => finding.id === "policy.required.tests" && finding.status === "missing");
  if (testFinding || (loop.changedFiles.length > 0 && loop.trace.passedTestEvidence === "none")) {
    gates.push({
      id: "evidence.no-test-after-edit",
      guard: "evidence",
      condition: "no test command after last edit",
      status: "blocked",
      severity: "blocker",
      action: "run-tests",
      evidence: [...(testFinding?.evidence ?? []), ...loop.trace.signals],
      findingIds: testFinding ? [testFinding.id] : []
    });
  }

  const failedTest = latestTestResults.find(testStepFailedByExitCode);
  if (failedTest) {
    gates.push({
      id: "evidence.test-exit-code",
      guard: "evidence",
      condition: "test exit code != 0",
      status: "blocked",
      severity: "blocker",
      action: "repair",
      evidence: [`step: ${failedTest.id}`, `command: ${failedTest.command ?? failedTest.action}`, `exit code: ${failedTest.exitCode}`],
      findingIds: []
    });
  }

  const failureOutput = latestTestResults.find(testStepHasFailureOutput);
  if (failureOutput) {
    gates.push({
      id: "evidence.test-output-failure",
      guard: "evidence",
      condition: "test output contains failure",
      status: "blocked",
      severity: "blocker",
      action: "repair",
      evidence: [`step: ${failureOutput.id}`, `command: ${failureOutput.command ?? failureOutput.action}`],
      findingIds: []
    });
  }

  const staleEvidence = policy.results.find((finding) => finding.evidence.some((item) => /Working tree hash is stale/i.test(item)));
  if (staleEvidence) {
    gates.push({
      id: "evidence.working-tree-hash-mismatch",
      guard: "evidence",
      condition: "working tree hash mismatch",
      status: "blocked",
      severity: "blocker",
      action: "run-tests",
      evidence: staleEvidence.evidence,
      findingIds: [staleEvidence.id]
    });
  }

  return gates;
}

function hallucinationGates(guardFindings: GuardFindingsArtifact): GuardGate[] {
  const hallucinations = guardFindings.findings.filter(
    (finding) => finding.source === "hallucination" && (finding.status === "failed" || finding.status === "missing")
  );
  if (!hallucinations.length) return [];
  return [
    {
      id: "hallucination.missing-reference",
      guard: "hallucination",
      condition: "nonexistent file/script/symbol/dependency/config/env",
      status: "blocked",
      severity: "blocker",
      action: hallucinations.some((finding) => /missing_command/.test(finding.message)) ? "repair" : "block",
      evidence: hallucinations.flatMap((finding) => [finding.message, ...finding.evidence]).slice(0, 12),
      findingIds: hallucinations.map((finding) => finding.id)
    }
  ];
}

function regressionGates(guardFindings: GuardFindingsArtifact, policy: PolicyEngineReport): GuardGate[] {
  const regressionFindings = guardFindings.findings.filter((finding) => finding.source === "regression");
  if (!regressionFindings.length) return [];
  const missingEvidence = regressionFindings.filter((finding) => finding.status === "missing");
  const policyRegression = policy.results.find((finding) => finding.id === "policy.required.regression-tests" && finding.status === "missing");
  return [
    {
      id: missingEvidence.length ? "regression.missing-required-test" : "regression.fragile-module",
      guard: "regression",
      condition: missingEvidence.length ? "missing required regression test" : "changed fragile module / matched historical bug pattern",
      status: missingEvidence.length || policyRegression ? "blocked" : "warning",
      severity: missingEvidence.length || policyRegression ? "blocker" : "warning",
      action: missingEvidence.length || policyRegression ? "run-regression-tests" : "human-review",
      evidence: [...regressionFindings.flatMap((finding) => [finding.message, ...finding.evidence]), ...(policyRegression?.evidence ?? [])].slice(0, 12),
      findingIds: [...regressionFindings.map((finding) => finding.id), ...(policyRegression ? [policyRegression.id] : [])]
    }
  ];
}

function passedGate(id: string, guard: GuardGateName, condition: string, action: GuardGateAction, evidence: string[]): GuardGate {
  return {
    id,
    guard,
    condition,
    status: "passed",
    severity: "passed",
    action,
    evidence,
    findingIds: []
  };
}

function summarizeGates(gates: GuardGate[]): GuardGateReport["summary"] {
  const byGuard = {
    context: summarizeGuard(gates, "context"),
    boundary: summarizeGuard(gates, "boundary"),
    evidence: summarizeGuard(gates, "evidence"),
    hallucination: summarizeGuard(gates, "hallucination"),
    regression: summarizeGuard(gates, "regression")
  };
  return {
    total: gates.length,
    blocking: gates.filter((gate) => gate.status === "blocked").length,
    warnings: gates.filter((gate) => gate.status === "warning").length,
    passed: gates.filter((gate) => gate.status === "passed").length,
    byGuard
  };
}

function summarizeGuard(gates: GuardGate[], guard: GuardGateName): { blocking: number; warnings: number; passed: number } {
  const matching = gates.filter((gate) => gate.guard === guard);
  return {
    blocking: matching.filter((gate) => gate.status === "blocked").length,
    warnings: matching.filter((gate) => gate.status === "warning").length,
    passed: matching.filter((gate) => gate.status === "passed").length
  };
}
