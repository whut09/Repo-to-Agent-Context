import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RevisionConflictError } from "../src/core/atomic-store.js";
import { readRunState, runStatePath, writeRunState, type RunStateSnapshot } from "../src/outputs/runtime-state.js";

test("runtime state preserves persisted revisions across writes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-runtime-state-"));
  try {
    const snapshot = createSnapshot();
    writeRunState(root, snapshot);
    assert.equal(snapshot.revision, 1);
    writeRunState(root, snapshot);
    assert.equal(snapshot.revision, 2);
    assert.equal(readRunState(root, snapshot.taskId)?.revision, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime state reports revision conflicts for stale snapshots", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-runtime-conflict-"));
  try {
    const current = createSnapshot();
    writeRunState(root, current);
    const stale = { ...current };
    writeRunState(root, current);
    assert.throws(
      () => writeRunState(root, stale),
      (error: unknown) => error instanceof RevisionConflictError && error.expectedRevision === 1 && error.actualRevision === 2
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime state reports corrupt JSON instead of treating it as empty", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-runtime-corrupt-"));
  try {
    const filePath = runStatePath(root, "desktop-task");
    writeRunState(root, createSnapshot());
    writeFileSync(filePath, "{broken", "utf8");
    assert.throws(() => readRunState(root, "desktop-task"), /Unable to read runtime state desktop-task/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createSnapshot(): RunStateSnapshot {
  return {
    schemaVersion: 1,
    revision: 0,
    state: "EDIT_BOUNDARY_READY",
    taskId: "desktop-task",
    task: "verify Desktop persistence",
    phase: "preflight",
    repoHash: "repo",
    contextHash: "context",
    diffHash: "diff",
    updatedAt: "2026-08-24T00:00:00.000Z",
    lastAction: "preflight",
    allowedActions: ["start_agent"],
    nextAction: {
      type: "start_agent",
      blocking: false,
      reason: "ready",
      expectedEvidence: ["agent_started"]
    },
    satisfiedEvidence: ["context_fresh"],
    missingEvidence: ["agent_edit"],
    transitionReason: "state EDIT_BOUNDARY_READY"
  };
}
