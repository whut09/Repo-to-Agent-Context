import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionTrace, ExecutionTraceStep } from "../src/harness/observability/execution-trace.js";
import { evidenceSatisfies } from "../src/outputs/evidence.js";

const currentHash = "current-tree";

test("advisory accepts manual test evidence as an unverified claim", () => {
  const result = evidenceSatisfies(requirement("tests", "advisory"), trace([manualTest()]));

  assert.equal(result.satisfied, true);
  assert.equal(result.level, "manual");
  assert.equal(result.claimed, true);
  assert.equal(result.verified, false);
  assert.equal(result.requiredLevel, "manual");
});

test("balanced rejects manual-only test evidence after source changes", () => {
  const result = evidenceSatisfies({ ...requirement("tests", "balanced"), sourceChanged: true }, trace([manualTest()]));

  assert.equal(result.satisfied, false);
  assert.equal(result.claimed, true);
  assert.equal(result.verified, false);
  assert.equal(result.requiredLevel, "command");
});

test("strict rejects manual test and contract evidence", () => {
  const testResult = evidenceSatisfies(requirement("tests", "strict"), trace([manualTest()]));
  const contractResult = evidenceSatisfies(requirement("contract-validation", "strict"), trace([manualContract()]));

  assert.equal(testResult.satisfied, false);
  assert.equal(contractResult.satisfied, false);
  assert.equal(testResult.requiredLevel, "command");
  assert.equal(contractResult.requiredLevel, "command");
});

test("strict accepts current-tree harness command evidence", () => {
  const result = evidenceSatisfies(requirement("tests", "strict"), trace([commandTest(currentHash)]));

  assert.equal(result.satisfied, true);
  assert.equal(result.level, "command");
  assert.equal(result.verified, true);
});

test("strict accepts valid CI evidence", () => {
  const result = evidenceSatisfies(requirement("tests", "strict"), trace([ciTest(currentHash)]));

  assert.equal(result.satisfied, true);
  assert.equal(result.level, "ci");
  assert.equal(result.verified, true);
});

test("test selection output cannot satisfy test evidence", () => {
  const result = evidenceSatisfies(
    requirement("tests", "strict"),
    trace([commandTest(currentHash, 0, "selection complete", "2026-01-01T00:00:20.000Z", "opencode-plusplus tests . --diff --base main")])
  );

  assert.equal(result.satisfied, false);
  assert.equal(result.claimed, false);
  assert.equal(result.verified, false);
});

test("latest failure supersedes an earlier success for the same command", () => {
  const result = evidenceSatisfies(
    requirement("tests", "strict"),
    trace([commandTest(currentHash, 0, "ok"), commandTest(currentHash, 1, "failed", "2026-01-01T00:00:30.000Z")])
  );
  assert.equal(result.satisfied, false);
  assert.equal(result.verified, false);
});

test("latest success supersedes an earlier failure for the same command", () => {
  const result = evidenceSatisfies(
    requirement("tests", "strict"),
    trace([commandTest(currentHash, 1, "failed"), commandTest(currentHash, 0, "ok", "2026-01-01T00:00:30.000Z")])
  );
  assert.equal(result.satisfied, true);
  assert.equal(result.verified, true);
});

test("different test commands do not supersede one another", () => {
  const result = evidenceSatisfies(
    { ...requirement("tests", "strict"), requiredCommands: ["npm run test -- auth"] },
    trace([commandTest(currentHash, 0, "ok"), commandTest(currentHash, 1, "failed", "2026-01-01T00:00:30.000Z", "npm run test -- other")])
  );
  assert.equal(result.satisfied, true);
});

test("strict rejects stale command and CI evidence", () => {
  const commandResult = evidenceSatisfies(requirement("tests", "strict"), trace([commandTest("old-tree")]));
  const ciResult = evidenceSatisfies(requirement("tests", "strict"), trace([ciTest("old-tree")]));

  assert.equal(commandResult.satisfied, false);
  assert.equal(ciResult.satisfied, false);
  assert.equal(commandResult.stale, true);
  assert.equal(ciResult.stale, true);
  assert.equal(commandResult.verified, false);
  assert.equal(ciResult.verified, false);
});

function requirement(kind: "tests" | "contract-validation", policy: "advisory" | "balanced" | "strict") {
  return {
    kind,
    currentRepoHash: currentHash,
    requiredCommands: kind === "tests" ? ["npm run test"] : ["opencode-plusplus validate-contracts . --base main"],
    policy
  } as const;
}

function trace(steps: ExecutionTraceStep[]): ExecutionTrace {
  return {
    schemaVersion: 1,
    id: "evidence-policy",
    task: "verify evidence policy",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    finalState: "in_progress",
    steps
  };
}

function manualTest(): ExecutionTraceStep {
  return step({ id: "manual-test", action: "run-test", command: "npm run test", result: "passed", evidenceSource: "manual" });
}

function manualContract(): ExecutionTraceStep {
  return step({
    id: "manual-contract",
    action: "validate-contracts",
    command: "opencode-plusplus validate-contracts . --base main",
    result: "passed",
    evidenceSource: "manual"
  });
}

function commandTest(
  workingTreeHashAfter: string,
  exitCode = 0,
  output = "ok",
  finishedAt = "2026-01-01T00:00:20.000Z",
  command = "npm run test"
): ExecutionTraceStep {
  return step({
    id: `command-test-${finishedAt}-${exitCode}-${command}`,
    action: "run-test",
    command,
    result: exitCode === 0 ? "passed" : "failed",
    output,
    evidenceSource: "command",
    capturedBy: "opencode-plusplus",
    exitCode,
    startedAt: "2026-01-01T00:00:10.000Z",
    finishedAt,
    stdoutHash: "stdout",
    stderrHash: "stderr",
    workingTreeHashBefore: workingTreeHashAfter,
    workingTreeHashAfter
  });
}

function ciTest(workingTreeHashAfter: string): ExecutionTraceStep {
  return step({
    id: "ci-test",
    action: "run-test",
    command: "npm run test",
    result: "passed",
    evidenceSource: "ci",
    exitCode: 0,
    finishedAt: "2026-01-01T00:00:20.000Z",
    workingTreeHashAfter
  });
}

function step(input: Partial<ExecutionTraceStep> & Pick<ExecutionTraceStep, "id" | "action">): ExecutionTraceStep {
  return {
    at: input.finishedAt ?? "2026-01-01T00:00:20.000Z",
    files: [],
    ...input
  };
}
