import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getApplicationInterventions } from "../src/application/intervention-service.js";
import { appendInterventionEvent, createInterventionEvent } from "../src/harness/observability/intervention-ledger.js";

test("application intervention service returns a deterministic empty and active summary", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-intervention-service-"));
  try {
    assert.equal(getApplicationInterventions(root, "task-1").summary.total, 0);
    appendInterventionEvent(
      root,
      createInterventionEvent({
        interventionId: "intervention-1",
        taskId: "task-1",
        sessionId: "session-1",
        timestamp: "2026-08-26T00:00:00.000Z",
        phase: "evaluate",
        category: "evidence",
        problem: "Focused test evidence is missing.",
        targetFiles: ["src/auth.ts"],
        action: "run focused tests",
        beforeState: {},
        afterState: { status: "requested" },
        evidenceRefs: [],
        status: "requested",
        confidence: 0.9,
        source: "system"
      })
    );
    const result = getApplicationInterventions(root, "task-1");
    assert.equal(result.summary.byStatus.requested, 1);
    assert.equal(result.events[0]?.problem, "Focused test evidence is missing.");
    assert.equal(result.feedback.evidenceAuthority, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
