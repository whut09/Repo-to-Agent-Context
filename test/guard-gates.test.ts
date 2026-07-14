import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionTrace, ExecutionTraceStep } from "../src/harness/observability/execution-trace.js";
import type { LoopControllerReport } from "../src/harness/control-plane/loop-controller.js";
import type { PolicyEngineReport } from "../src/harness/verification-plane/policy-engine.js";
import { evidenceSatisfies, latestTestResultSteps } from "../src/outputs/evidence.js";
import type { GuardFindingsArtifact } from "../src/outputs/guard-finding.js";
import { buildGuardGateReport } from "../src/outputs/guard-gates.js";

test("latest successful equivalent test command supersedes an earlier failure", () => {
  const trace = createTrace([
    editStep("step-002", "2026-01-01T00:00:01.000Z"),
    testStep("step-003", "2026-01-01T00:00:02.000Z", "npm test", 1, "1 failed"),
    testStep("step-004", "2026-01-01T00:00:03.000Z", "npm run test", 0, "all tests passed")
  ]);

  const report = buildEvidenceGateReport(trace);

  assert.equal(
    report.gates.some((gate) => gate.id === "evidence.test-exit-code"),
    false
  );
  assert.equal(
    report.gates.some((gate) => gate.id === "evidence.test-output-failure"),
    false
  );
  assert.deepEqual(
    latestTestResultSteps(trace, { afterLastEdit: true }).map((step) => step.id),
    ["step-004"]
  );
});

test("latest failed equivalent test command supersedes an earlier success", () => {
  const trace = createTrace([
    editStep("step-002", "2026-01-01T00:00:01.000Z"),
    testStep("step-003", "2026-01-01T00:00:02.000Z", "npm run test", 0, "all tests passed"),
    testStep("step-004", "2026-01-01T00:00:03.000Z", "npm test", 1, "1 failed")
  ]);

  const report = buildEvidenceGateReport(trace);
  const evidence = evidenceSatisfies({ kind: "tests", currentRepoHash: "current", requiredCommands: ["npm run test"] }, trace);

  assert.equal(
    report.gates.some((gate) => gate.id === "evidence.test-exit-code"),
    true
  );
  assert.equal(
    report.gates.some((gate) => gate.id === "evidence.test-output-failure"),
    true
  );
  assert.equal(evidence.satisfied, false);
  assert.equal(evidence.level, "none");
});

test("successful test evidence becomes stale after a later edit", () => {
  const trace = createTrace([
    editStep("step-002", "2026-01-01T00:00:01.000Z"),
    testStep("step-003", "2026-01-01T00:00:02.000Z", "npm run test", 0, "all tests passed", "old-tree"),
    editStep("step-004", "2026-01-01T00:00:03.000Z")
  ]);

  const evidence = evidenceSatisfies({ kind: "tests", currentRepoHash: "new-tree", requiredCommands: ["npm run test"] }, trace);

  assert.equal(evidence.satisfied, false);
  assert.equal(evidence.stale, true);
  assert.ok(evidence.evidence.some((item) => item.includes("before last edit")));
  assert.deepEqual(latestTestResultSteps(trace, { afterLastEdit: true }), []);
});

test("success from a different test command does not supersede an unrelated failure", () => {
  const trace = createTrace([
    editStep("step-002", "2026-01-01T00:00:01.000Z"),
    testStep("step-003", "2026-01-01T00:00:02.000Z", "npm test -- auth", 1, "auth failed"),
    testStep("step-004", "2026-01-01T00:00:03.000Z", "npm test -- billing", 0, "billing passed")
  ]);

  const report = buildEvidenceGateReport(trace);

  assert.equal(
    report.gates.some((gate) => gate.id === "evidence.test-exit-code"),
    true
  );
  assert.deepEqual(
    latestTestResultSteps(trace, { afterLastEdit: true }).map((step) => step.id),
    ["step-003", "step-004"]
  );
});

function buildEvidenceGateReport(trace: ExecutionTrace) {
  return buildGuardGateReport({
    runId: trace.id,
    iteration: 1,
    policy: emptyPolicy(),
    loop: passingLoop(),
    guardFindings: emptyGuardFindings(trace.id),
    trace,
    changedFiles: ["src/session.ts"],
    checkpointMode: "none"
  });
}

function createTrace(steps: ExecutionTraceStep[]): ExecutionTrace {
  return {
    schemaVersion: 1,
    id: "test-evidence-selection",
    task: "verify latest test evidence",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: steps.at(-1)?.at ?? "2026-01-01T00:00:00.000Z",
    finalState: "in_progress",
    steps: [
      {
        id: "step-001",
        at: "2026-01-01T00:00:00.000Z",
        action: "context-run-created",
        files: [],
        evidenceSource: "manual"
      },
      ...steps
    ]
  };
}

function editStep(id: string, at: string): ExecutionTraceStep {
  return {
    id,
    at,
    action: "edit",
    files: ["src/session.ts"],
    evidenceSource: "manual"
  };
}

function testStep(id: string, at: string, command: string, exitCode: number, output: string, workingTreeHashAfter = "current"): ExecutionTraceStep {
  return {
    id,
    at,
    action: "run-test",
    command,
    files: [],
    result: exitCode === 0 ? "passed" : "failed",
    output,
    evidenceSource: "command",
    capturedBy: "opencode-plusplus",
    exitCode,
    startedAt: at,
    finishedAt: at,
    stdoutHash: "stdout",
    stderrHash: "stderr",
    workingTreeHashBefore: workingTreeHashAfter,
    workingTreeHashAfter
  };
}

function emptyPolicy(): PolicyEngineReport {
  return {
    passed: true,
    base: "main",
    traceLoaded: true,
    failOn: "required",
    changedFiles: ["src/session.ts"],
    generatedContextFiles: [],
    summary: { forbidden: 0, risks: 0, requiredMissing: 0, requiredSatisfied: 0 },
    findings: [],
    results: []
  };
}

function passingLoop(): LoopControllerReport {
  return {
    task: "verify latest test evidence",
    phase: "after-edit",
    base: "main",
    status: "ready",
    changedFiles: ["src/session.ts"],
    risk: "Low",
    context: { freshness: "fresh", drift: "clean", taskPackTokens: 1, taskPackBudget: 100 },
    trace: { loaded: true, passedTestEvidence: "command", signals: [] },
    checks: { contracts: "passed", contractViolations: 0, minimalTests: 1, regressionTests: 0, impactDependents: 0 },
    decisions: [],
    runtime: {} as LoopControllerReport["runtime"]
  };
}

function emptyGuardFindings(runId: string): GuardFindingsArtifact {
  return {
    schemaVersion: "opencode-plusplus.guard-findings.v1",
    kind: "guard-findings",
    generatedAt: "2026-01-01T00:00:00.000Z",
    runId,
    iteration: 1,
    findings: [],
    summary: { total: 0, forbidden: 0, requiredMissing: 0, risks: 0, hallucinationErrors: 0, regressionMatches: 0 }
  };
}
