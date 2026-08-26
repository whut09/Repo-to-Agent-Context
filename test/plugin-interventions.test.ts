import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { appendInterventionEvent, createInterventionEvent } from "../src/harness/observability/intervention-ledger.js";
import { pluginInterventionSnapshot } from "../src/integrations/opencode/plugin-runtime/harness/interventions.js";
import { recordContextFeedback } from "../src/context-registry/feedback-store.js";

test("plugin intervention snapshot exposes selected, excluded, active, and verified work", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-interventions-"));
  try {
    const requested = makeEvent("intervention-requested", "requested", "Run the focused test command.");
    const verified = makeEvent("intervention-verified", "verified", "Login timeout fix verified.");
    appendInterventionEvent(root, requested);
    appendInterventionEvent(root, makeEvent("intervention-verified", "requested", "Login timeout fix requested."));
    appendInterventionEvent(root, makeEvent("intervention-verified", "repaired", "Login timeout fix repaired."));
    appendInterventionEvent(root, {
      ...verified,
      eventId: "event-verified",
      status: "verified",
      resolutionEvidence: [{ kind: "command", ref: "trace-step-1", valid: true, currentWorkingTree: true }]
    });
    recordContextFeedback({ repository: root, entryId: "official/auth", source: "official", revision: 1, target: "entry", label: "useful" });
    const snapshot = pluginInterventionSnapshot(root, "task-1", ["src/auth/session.ts"], [{ path: "src/auth/legacy.ts", reason: "not selected by top-k" }]);

    assert.equal(snapshot.ledgerPath, ".agent-context/interventions/task-1.jsonl");
    assert.equal(snapshot.eventCount, 4);
    assert.deepEqual(snapshot.selectedFiles, ["src/auth/session.ts"]);
    assert.equal(snapshot.excludedFiles[0]?.reason, "not selected by top-k");
    assert.ok(snapshot.verifiedFixes.some((event) => event.interventionId === "intervention-verified"));
    assert.ok(snapshot.remainingProblems.some((event) => event.interventionId === "intervention-requested"));
    assert.equal(snapshot.feedback?.total, 1);
    assert.equal(snapshot.feedback?.annotationSeparate, true);
    assert.equal(snapshot.feedback?.evidenceAuthority, false);
    assert.equal(
      readFileSync(path.join(root, ".agent-context", "interventions", "task-1.jsonl"), "utf8")
        .trim()
        .split(/\r?\n/).length,
      4
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeEvent(interventionId: string, status: "requested" | "repaired" | "verified", problem: string) {
  return createInterventionEvent({
    interventionId,
    taskId: "task-1",
    sessionId: "session-1",
    timestamp: "2026-08-25T00:00:00.000Z",
    phase: "evaluate",
    category: "evidence",
    problem,
    targetFiles: ["src/auth/session.ts"],
    action: status === "verified" ? "verify fix" : "run focused tests",
    beforeState: {},
    afterState: { status },
    evidenceRefs: ["trace-step-1"],
    status,
    confidence: 0.9,
    source: "evidence",
    resolutionEvidence: status === "verified" ? [{ kind: "command", ref: "trace-step-1", valid: true, currentWorkingTree: true }] : undefined
  });
}
