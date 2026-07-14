import assert from "node:assert/strict";
import test from "node:test";
import type { GuardGate, GuardGateReport } from "../src/outputs/guard-gates.js";
import type { LoopControllerReport } from "../src/harness/control-plane/loop-controller.js";
import type { PolicyEngineReport } from "../src/harness/verification-plane/policy-engine.js";
import { arbitrateDecisionCandidates, decideHarnessAction, type DecisionEngineInput } from "../src/harness/control-plane/decision-engine.js";
import type { HarnessDecisionCandidate } from "../src/harness/types.js";

test("rollback outranks repack and gate order does not affect arbitration", () => {
  const gates = [gate("context.stale", "context", "repack"), gate("boundary.forbidden", "boundary", "rollback")];
  const forward = decideHarnessAction(decisionInput(gates, { checkpointMode: "git-worktree" }));
  const reversed = decideHarnessAction(decisionInput([...gates].reverse(), { checkpointMode: "git-worktree" }));

  assert.equal(forward.action, "rollback");
  assert.equal(forward.arbitration?.selectedCandidate.id, "guard-gate.boundary.forbidden");
  assert.equal(forward.arbitration?.selectedPriority, 100);
  assert.deepEqual(forward, reversed);
});

test("repair outranks run-tests while retaining the test blocker", () => {
  const result = decideHarnessAction(decisionInput([gate("evidence.tests", "evidence", "run-tests"), gate("contracts.failed", "boundary", "repair")]));

  assert.equal(result.action, "repair");
  assert.equal(result.arbitration?.selectedCandidate.id, "guard-gate.contracts.failed");
  assert.ok(result.arbitration?.supportingCandidates.some((candidate) => candidate.id === "guard-gate.evidence.tests"));
  assert.ok(result.reasons.some((reason) => reason.includes("Supporting blocker [guard-gate.evidence.tests]")));
});

test("arbitration merges supporting commands and artifacts deterministically", () => {
  const candidates: HarnessDecisionCandidate[] = [
    candidate("tests", "run-tests", ["npm run test", "npm run lint"], [{ path: "test.json", kind: "guard" }]),
    candidate("repair", "repair", ["npm run test", "npm run check"], [{ path: "repair.json", kind: "decision" }])
  ];
  const forward = arbitrateDecisionCandidates(candidates);
  const reversed = arbitrateDecisionCandidates([...candidates].reverse());

  assert.equal(forward.action, "repair");
  assert.deepEqual(forward.requiredCommands, ["npm run check", "npm run test", "npm run lint"]);
  assert.deepEqual(
    forward.artifacts.map((artifact) => artifact.path),
    ["repair.json", "test.json"]
  );
  assert.deepEqual(forward, reversed);
  assert.equal(forward.arbitration?.supportingCandidates.length, 1);
});

test("policy forbidden explicitly outranks executor failure when rollback is available", () => {
  const input = decisionInput([], { checkpointMode: "git-worktree", executorExitCode: 2, forbidden: 1 });
  const result = decideHarnessAction(input);

  assert.equal(result.action, "rollback");
  assert.equal(result.arbitration?.selectedCandidate.id, "policy.forbidden");
  assert.ok(result.arbitration?.supportingCandidates.some((candidate) => candidate.id === "executor.failure"));
});

function decisionInput(
  gates: GuardGate[],
  options: { checkpointMode?: "none" | "git-worktree"; executorExitCode?: number; forbidden?: number } = {}
): DecisionEngineInput {
  return {
    executorResult: { exitCode: options.executorExitCode ?? 0, stderr: options.executorExitCode ? "executor failed" : "" },
    changedFiles: ["src/session.ts"],
    policy: policy(options.forbidden ?? 0),
    loop: loop(),
    guardGates: gateReport(gates),
    checkpointMode: options.checkpointMode ?? "none"
  };
}

function gate(id: string, guard: GuardGate["guard"], action: GuardGate["action"]): GuardGate {
  return {
    id,
    guard,
    condition: `${id} condition`,
    status: "blocked",
    severity: "blocker",
    action,
    evidence: [`${id} evidence`],
    findingIds: []
  };
}

function gateReport(gates: GuardGate[]): GuardGateReport {
  const byGuard: GuardGateReport["summary"]["byGuard"] = {
    context: { blocking: 0, warnings: 0, passed: 0 },
    boundary: { blocking: 0, warnings: 0, passed: 0 },
    evidence: { blocking: 0, warnings: 0, passed: 0 },
    hallucination: { blocking: 0, warnings: 0, passed: 0 },
    regression: { blocking: 0, warnings: 0, passed: 0 }
  };
  for (const item of gates) byGuard[item.guard].blocking += 1;
  return {
    schemaVersion: "opencode-plusplus.guard-gates.v1",
    kind: "guard-gates",
    generatedAt: "2026-01-01T00:00:00.000Z",
    runId: "decision-test",
    iteration: 1,
    gates,
    summary: { total: gates.length, blocking: gates.length, warnings: 0, passed: 0, byGuard }
  };
}

function policy(forbidden: number): PolicyEngineReport {
  return {
    passed: forbidden === 0,
    base: "main",
    traceLoaded: true,
    failOn: "required",
    changedFiles: ["src/session.ts"],
    generatedContextFiles: [],
    summary: { forbidden, risks: 0, requiredMissing: 0, requiredSatisfied: 0 },
    findings: [],
    results: []
  };
}

function loop(): LoopControllerReport {
  return {
    task: "decision arbitration",
    phase: "after-edit",
    base: "main",
    status: "needs-repair",
    changedFiles: ["src/session.ts"],
    risk: "Low",
    context: { freshness: "fresh", drift: "clean", taskPackTokens: 1, taskPackBudget: 100 },
    trace: { loaded: true, passedTestEvidence: "command", signals: [] },
    checks: { contracts: "passed", contractViolations: 0, minimalTests: 1, regressionTests: 0, impactDependents: 0 },
    decisions: [],
    runtime: {} as LoopControllerReport["runtime"]
  };
}

function candidate(
  id: string,
  action: HarnessDecisionCandidate["action"],
  requiredCommands: string[],
  artifacts: HarnessDecisionCandidate["artifacts"]
): HarnessDecisionCandidate {
  return {
    id,
    source: "guard-gate",
    action,
    priority: 0,
    blocking: true,
    confidence: 0.9,
    reasons: [`${id} reason`],
    requiredCommands,
    artifacts
  };
}
