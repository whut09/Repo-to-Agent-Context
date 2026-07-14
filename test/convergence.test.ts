import assert from "node:assert/strict";
import test from "node:test";
import { buildIterationStateFingerprint, evaluateConvergence } from "../src/harness/control-plane/convergence.js";
import type { HarnessDecision } from "../src/harness/types.js";

test("iteration fingerprint is stable regardless of array order", () => {
  const first = buildIterationStateFingerprint({
    workingTreeHash: "tree-a",
    decisionAction: "repair",
    blockingFindingIds: ["finding-b", "finding-a", "finding-a"],
    blockingGateIds: ["gate-b", "gate-a"],
    missingEvidence: ["tests", "contracts"],
    requiredCommands: ["npm run test", "npm run check"],
    contextFreshness: "fresh",
    contextDrift: "clean"
  });
  const reordered = buildIterationStateFingerprint({
    workingTreeHash: "tree-a",
    decisionAction: "repair",
    blockingFindingIds: ["finding-a", "finding-b"],
    blockingGateIds: ["gate-a", "gate-b"],
    missingEvidence: ["contracts", "tests"],
    requiredCommands: ["npm run check", "npm run test"],
    contextFreshness: "fresh",
    contextDrift: "clean"
  });

  assert.equal(first.value, reordered.value);
  assert.deepEqual(first.state.blockingFindingIds, ["finding-a", "finding-b"]);
  assert.deepEqual(first.state.requiredCommands, ["npm run check", "npm run test"]);
});

test("changed diff or missing evidence is treated as progress", () => {
  const previous = buildIterationStateFingerprint(baseFingerprintInput());
  const changedDiff = buildIterationStateFingerprint({ ...baseFingerprintInput(), workingTreeHash: "tree-b" });
  const changedEvidence = buildIterationStateFingerprint({ ...baseFingerprintInput(), missingEvidence: ["contracts"] });

  assert.notEqual(previous.value, changedDiff.value);
  assert.notEqual(previous.value, changedEvidence.value);
  assert.equal(evaluateConvergence(evaluationInput(changedDiff, previous)).status, "progressing");
  assert.equal(evaluateConvergence(evaluationInput(changedEvidence, previous)).status, "progressing");
});

test("matching blocking fingerprints produce repeated-state convergence", () => {
  const fingerprint = buildIterationStateFingerprint(baseFingerprintInput());
  const convergence = evaluateConvergence(evaluationInput(fingerprint, fingerprint));

  assert.equal(convergence.status, "repeated-state");
  assert.equal(convergence.stopReason, "repeated-state/no-progress");
  assert.equal(convergence.shouldStop, true);
});

function baseFingerprintInput() {
  return {
    workingTreeHash: "tree-a",
    decisionAction: "repair" as const,
    blockingFindingIds: ["finding-a"],
    blockingGateIds: ["gate-a"],
    missingEvidence: ["tests"],
    requiredCommands: ["npm run test"],
    contextFreshness: "fresh",
    contextDrift: "clean"
  };
}

function evaluationInput(
  fingerprint: ReturnType<typeof buildIterationStateFingerprint>,
  previousFingerprint: ReturnType<typeof buildIterationStateFingerprint>
) {
  const decision: HarnessDecision = {
    action: "repair",
    blocking: true,
    confidence: 0.9,
    reasons: ["repair required"],
    requiredCommands: ["npm run test"],
    artifacts: []
  };
  return { fingerprint, previousFingerprint, decision, executorExitCode: 0, loopIndex: 2, maxLoops: 3 };
}
