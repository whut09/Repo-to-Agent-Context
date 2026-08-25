import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { recordIterationInterventions } from "../src/harness/observability/intervention-mapper.js";
import { listInterventionEvents } from "../src/harness/observability/intervention-ledger.js";
import type { ExecutionTrace } from "../src/harness/observability/execution-trace.js";
import type { PolicyEngineReport } from "../src/harness/verification-plane/policy-engine.js";
import type { GuardFindingsArtifact } from "../src/outputs/guard-finding.js";
import type { GuardGateReport } from "../src/outputs/guard-gates.js";
import type { HarnessDecision } from "../src/harness/types.js";

test("mapper records prevented, requested, unresolved and verified states", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-intervention-map-"));
  try {
    const input = baseInput(root);
    const first = recordIterationInterventions({ ...input, executorExitCode: 2 });
    const statuses = listInterventionEvents(root, "task-1").map((event) => event.status);
    assert.ok(statuses.includes("prevented"));
    assert.ok(statuses.includes("requested"));
    assert.ok(statuses.includes("unresolved"));
    const boundary = listInterventionEvents(root, "task-1").find((event) => event.findingId === "boundary.forbidden");
    assert.equal(boundary?.status, "prevented");
    assert.equal(listInterventionEvents(root, "task-1").some((event) => event.findingId === "boundary.forbidden" && event.status === "repaired"), false);
    assert.equal(first.decision.interventionIds?.length, first.interventionIds.length);

    const verifiedPolicy = { ...input.policy, findings: input.policy.findings.map((finding) => ({ ...finding, status: "satisfied" as const, evidence: ["command passed"] })) };
    const verified = recordIterationInterventions({ ...input, policy: verifiedPolicy, trace: currentCommandTrace(), guardGates: passingGates(), decision: finalizeDecision(), executorExitCode: 0 });
    assert.ok(verified.events.some((event) => event.status === "verified"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale evidence becomes stale instead of fixed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-intervention-stale-"));
  try {
    const input = baseInput(root);
    recordIterationInterventions({ ...input, executorExitCode: 0 });
    const stalePolicy = { ...input.policy, findings: input.policy.findings.map((finding) => ({ ...finding, evidence: ["Working tree hash is stale: old -> new."] })) };
    const result = recordIterationInterventions({ ...input, policy: stalePolicy, iteration: 2, currentWorkingTreeHash: "new", executorExitCode: 0 });
    assert.ok(result.events.some((event) => event.status === "stale"));
    assert.equal(result.events.some((event) => event.status === "verified"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function baseInput(root: string) {
  const policy: PolicyEngineReport = {
    passed: false,
    base: "main",
    traceLoaded: true,
    failOn: "required",
    changedFiles: ["src/session.ts"],
    generatedContextFiles: [],
    summary: { forbidden: 1, risks: 0, requiredMissing: 1, requiredSatisfied: 0 },
    findings: [
      { id: "policy.forbidden.path", kind: "forbidden", status: "failed", severity: "error", message: "Forbidden path changed.", file: "src/session.ts", evidence: ["boundary"], requiredAction: "rollback" },
      { id: "policy.required.tests", kind: "required", status: "missing", severity: "required", message: "Tests missing.", evidence: ["No test evidence"], requiredAction: "npm test" }
    ],
    results: []
  };
  return {
    root,
    taskId: "task-1",
    sessionId: "session-1",
    iteration: 1,
    changedFiles: ["src/session.ts"],
    currentWorkingTreeHash: "current",
    trace: null as ExecutionTrace | null,
    policy,
    guardFindings: { schemaVersion: "opencode-plusplus.guard-findings.v1", kind: "guard-findings", generatedAt: "2026-01-01T00:00:00.000Z", runId: "task-1", iteration: 1, findings: [], summary: { total: 0, forbidden: 0, requiredMissing: 0, risks: 0, hallucinationErrors: 0, regressionMatches: 0 } } as GuardFindingsArtifact,
    guardGates: { schemaVersion: "opencode-plusplus.guard-gates.v1", kind: "guard-gates", generatedAt: "2026-01-01T00:00:00.000Z", runId: "task-1", iteration: 1, gates: [{ id: "boundary.forbidden", guard: "boundary", condition: "forbidden path", status: "blocked", severity: "blocker", action: "block", evidence: ["src/session.ts"], findingIds: [] }, { id: "evidence.test", guard: "evidence", condition: "test failed", status: "blocked", severity: "blocker", action: "repair", evidence: ["test failed"], findingIds: [] }], summary: { total: 2, blocking: 2, warnings: 0, passed: 0, byGuard: guardCounts() } } as GuardGateReport,
    decision: ({ action: "block", blocking: true, confidence: 1, reasons: ["blocked"], requiredCommands: [], artifacts: [] } as HarnessDecision)
  };
}

function guardCounts(): GuardGateReport["summary"]["byGuard"] {
  return { context: { blocking: 0, warnings: 0, passed: 0 }, boundary: { blocking: 1, warnings: 0, passed: 0 }, evidence: { blocking: 0, warnings: 0, passed: 0 }, hallucination: { blocking: 0, warnings: 0, passed: 0 }, regression: { blocking: 0, warnings: 0, passed: 0 } };
}

function passingGates(): GuardGateReport {
  return { schemaVersion: "opencode-plusplus.guard-gates.v1", kind: "guard-gates", generatedAt: "2026-01-01T00:00:00.000Z", runId: "task-1", iteration: 1, gates: [], summary: { total: 0, blocking: 0, warnings: 0, passed: 0, byGuard: guardCounts() } };
}

function finalizeDecision(): HarnessDecision {
  return { action: "finalize", blocking: false, confidence: 1, reasons: ["verified"], requiredCommands: [], artifacts: [] };
}

function currentCommandTrace(): ExecutionTrace {
  return { schemaVersion: 1, id: "trace-1", task: "task", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:01.000Z", finalState: "success", steps: [{ id: "step-1", at: "2026-01-01T00:00:01.000Z", action: "run-test", command: "npm test", files: [], result: "passed", evidenceSource: "command", capturedBy: "opencode-plusplus", exitCode: 0, workingTreeHashAfter: "current" }] };
}
