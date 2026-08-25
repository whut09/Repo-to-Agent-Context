import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendInterventionEvent,
  createInterventionEvent,
  findInterventions,
  interventionIdFor,
  interventionLedgerPath,
  readInterventionLedger,
  summarizeInterventions,
  validateInterventionTransition
} from "../src/harness/observability/intervention-ledger.js";

function event(taskId: string, status: "observed" | "prevented" | "requested" | "repaired" | "verified" | "unresolved" | "human-review" | "stale", interventionId = interventionIdFor({ taskId, findingId: "finding-1", category: "evidence", problem: "test evidence" })) {
  return createInterventionEvent({
    interventionId,
    taskId,
    sessionId: "session-1",
    timestamp: "2026-08-25T00:00:00.000Z",
    phase: "evaluate",
    category: "evidence",
    findingId: "finding-1",
    problem: "test evidence",
    targetFiles: ["src/test.ts"],
    action: "evaluate test evidence",
    beforeState: { status: "unknown" },
    afterState: { status },
    evidenceRefs: ["trace-1"],
    status,
    confidence: 1,
    source: "evidence",
    resolutionEvidence: status === "verified" ? [{ kind: "command", ref: "trace-step-1", valid: true, currentWorkingTree: true }] : undefined
  });
}

test("ledger appends atomically and duplicate event IDs are idempotent", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-intervention-"));
  try {
    const first = event("task-1", "observed");
    const persisted = appendInterventionEvent(root, first);
    const retry = appendInterventionEvent(root, first);
    const ledger = readInterventionLedger(root, "task-1");
    assert.equal(persisted.sequence, 1);
    assert.equal(retry.sequence, 1);
    assert.equal(ledger?.events.length, 1);
    assert.equal(ledger?.revision, 1);
    assert.ok(interventionLedgerPath(root, "task-1").includes("interventions"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ledger enforces the intervention state machine", () => {
  assert.throws(() => validateInterventionTransition("prevented", "repaired"), /prevented.*repaired/);
  assert.throws(() => validateInterventionTransition("repaired", "verified"), /current-working-tree/);
  assert.throws(() => validateInterventionTransition(undefined, "verified", [{ kind: "command", ref: "x", valid: true, currentWorkingTree: true }]), /initial/);
  assert.doesNotThrow(() => validateInterventionTransition("repaired", "verified", [{ kind: "ci", ref: "ci-1", valid: true, currentWorkingTree: true }]));
});

test("verified requires current command or CI evidence", () => {
  assert.throws(
    () => validateInterventionTransition("repaired", "verified", [{ kind: "manual", ref: "claim", valid: true, currentWorkingTree: true }]),
    /current-working-tree/
  );
  assert.doesNotThrow(() => validateInterventionTransition("stale", "requested"));
  assert.doesNotThrow(() => validateInterventionTransition("stale", "repaired"));
});

test("ledger transitions and reverse lookup expose a deterministic summary", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-intervention-summary-"));
  try {
    const interventionId = interventionIdFor({ taskId: "task-2", findingId: "finding-1", category: "evidence", problem: "test evidence" });
    appendInterventionEvent(root, event("task-2", "observed", interventionId));
    appendInterventionEvent(root, event("task-2", "requested", interventionId));
    appendInterventionEvent(root, event("task-2", "repaired", interventionId));
    appendInterventionEvent(root, event("task-2", "verified", interventionId));
    const ledger = readInterventionLedger(root, "task-2");
    assert.equal(ledger?.events.length, 4);
    assert.equal(summarizeInterventions(ledger?.events ?? []).verified.length, 1);
    assert.equal(findInterventions(root, "task-2", "finding-1").length, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
