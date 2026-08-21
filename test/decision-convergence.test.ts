import assert from "node:assert/strict";
import test from "node:test";
import { arbitrateDecisionCandidates } from "../src/harness/control-plane/decision-engine.js";
import { buildIterationStateFingerprint, evaluateConvergence } from "../src/harness/control-plane/convergence.js";
import type { HarnessDecisionCandidate } from "../src/harness/types.js";

function candidate(action: HarnessDecisionCandidate["action"], id: string, blocking = true): HarnessDecisionCandidate {
  return { id, source: "loop", action, priority: 0, blocking, confidence: 0.8, reasons: [id], requiredCommands: [], artifacts: [] };
}

test("decision priority is invariant to candidate order and preserves supporting blockers", () => {
  const candidates = [candidate("repair", "repair"), candidate("rollback", "rollback"), candidate("repack", "repack"), candidate("run-tests", "tests")];
  const first = arbitrateDecisionCandidates(candidates);
  const second = arbitrateDecisionCandidates([...candidates].reverse());
  assert.equal(first.action, "rollback");
  assert.equal(second.action, "rollback");
  assert.deepEqual(
    first.arbitration?.supportingCandidates.map((item) => item.id),
    second.arbitration?.supportingCandidates.map((item) => item.id)
  );
  assert.match(first.reasons.join("\n"), /Supporting blocker/);
});

test("same blocking fingerprint is no-progress, but evidence change is progress", () => {
  const input = {
    workingTreeHash: "tree",
    decisionAction: "repair" as const,
    blockingFindingIds: ["b"],
    blockingGateIds: ["gate"],
    missingEvidence: ["test"],
    requiredCommands: ["npm test"],
    contextFreshness: "fresh",
    contextDrift: "clean",
    taskId: "task",
    sessionId: "session"
  };
  const first = buildIterationStateFingerprint(input);
  const repeated = evaluateConvergence({
    fingerprint: first,
    previousFingerprint: first,
    decision: { action: "repair", blocking: true, confidence: 1, reasons: [], requiredCommands: [], artifacts: [] },
    executorExitCode: 0,
    loopIndex: 2,
    maxLoops: 3
  });
  assert.equal(repeated.status, "repeated-state");
  const changed = buildIterationStateFingerprint({ ...input, missingEvidence: ["different-test"] });
  const progressing = evaluateConvergence({
    fingerprint: changed,
    previousFingerprint: first,
    decision: { action: "repair", blocking: true, confidence: 1, reasons: [], requiredCommands: [], artifacts: [] },
    executorExitCode: 0,
    loopIndex: 2,
    maxLoops: 3
  });
  assert.equal(progressing.status, "progressing");
});

test("max loop terminal is distinct from repeated state", () => {
  const fingerprint = buildIterationStateFingerprint({
    workingTreeHash: "tree",
    decisionAction: "repair",
    blockingFindingIds: [],
    blockingGateIds: [],
    missingEvidence: [],
    requiredCommands: [],
    contextFreshness: "fresh",
    contextDrift: "clean",
    taskId: "task",
    sessionId: "session"
  });
  const result = evaluateConvergence({
    fingerprint,
    decision: { action: "repair", blocking: true, confidence: 1, reasons: [], requiredCommands: [], artifacts: [] },
    executorExitCode: 0,
    loopIndex: 1,
    maxLoops: 1
  });
  assert.equal(result.status, "max-loops-reached");
  assert.equal(result.repeated, false);
});
