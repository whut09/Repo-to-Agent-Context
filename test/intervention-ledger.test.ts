import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

test("corrupt ledger JSON returns a diagnostic error", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-intervention-corrupt-"));
  try {
    const filePath = interventionLedgerPath(root, "task-corrupt");
    const directory = path.dirname(filePath);
    mkdirSync(directory, { recursive: true });
    writeFileSync(filePath, "{not-json", "utf8");
    assert.throws(() => readInterventionLedger(root, "task-corrupt"), /Unable to read intervention ledger.*JSON/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent ledger appends retain every event", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-intervention-concurrent-"));
  const workerPath = path.join(root, "worker.mjs");
  try {
    const modulePath = pathToFileURL(path.resolve("src/harness/observability/intervention-ledger.ts")).href;
    writeFileSync(
      workerPath,
      `import { appendInterventionEvent } from ${JSON.stringify(modulePath)};\nconst [root, prefix] = process.argv.slice(2);\nfor (let i = 0; i < 10; i += 1) appendInterventionEvent(root, { schemaVersion: "opencode-plusplus.intervention.v1", eventId: prefix + i, interventionId: prefix + i, taskId: "task-concurrent", sessionId: prefix, timestamp: new Date().toISOString(), phase: "evaluate", category: "other", problem: prefix + i, targetFiles: [], action: "observe", beforeState: {}, afterState: {}, evidenceRefs: [], status: "observed", confidence: 1, source: "system" });\n`,
      "utf8"
    );
    await Promise.all([runWorker(workerPath, root, "a-"), runWorker(workerPath, root, "b-")]);
    const ledger = readInterventionLedger(root, "task-concurrent");
    assert.equal(ledger?.events.length, 20);
    assert.equal(new Set(ledger?.events.map((item) => item.sequence)).size, 20);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

function runWorker(workerPath: string, root: string, prefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", workerPath, root, prefix], { stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr || `Worker exited with ${code}.`))));
  });
}
