import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildContextPackage } from "../src/core/context-builder.js";
import { runGit } from "../src/core/git.js";
import {
  appendExecutionTraceStep,
  executionTracePath,
  readExecutionTrace,
  renderExecutionTrace,
  runTraceCommand,
  startExecutionTrace
} from "../src/harness/observability/execution-trace.js";
import { writeTaskRun } from "../src/outputs/task-run.js";

test("execution trace records agent steps and final state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-trace-"));
  try {
    const trace = startExecutionTrace(root, "fix login timeout bug", { agent: "codex" });
    const updated = appendExecutionTraceStep(root, trace.id, {
      agent: "codex",
      action: "edit",
      files: ["src/auth/session.ts"],
      reason: "timeout logic",
      finalState: "in_progress"
    });
    const final = appendExecutionTraceStep(root, trace.id, {
      action: "run-test",
      command: "npm test -- auth",
      test: "test/auth/session.test.ts",
      result: "failed",
      finalState: "partial_success"
    });
    const rendered = renderExecutionTrace(final);

    assert.equal(updated.steps.length, 2);
    assert.equal(final.finalState, "partial_success");
    assert.equal(final.steps[1]?.evidenceSource, "manual");
    assert.equal(final.steps[2]?.evidenceSource, "manual");
    assert.equal(final.steps[1]?.schemaVersion, 1);
    assert.equal(final.steps[1]?.sequence, 2);
    assert.equal(final.steps[2]?.sequence, 3);
    assert.equal(typeof final.steps[1]?.eventId, "string");
    assert.equal(final.steps[1]?.sessionId, trace.id);
    assert.equal(final.steps[1]?.taskId, trace.id);
    assert.equal(typeof final.steps[1]?.timestamp, "string");
    assert.equal(readExecutionTrace(root, trace.id)?.steps.length, 3);
    assert.ok(existsSync(executionTracePath(root, trace.id)));
    assert.match(rendered, /# Execution Trace/);
    assert.match(rendered, /src\/auth\/session\.ts/);
    assert.match(rendered, /npm test -- auth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execution trace run captures command evidence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-trace-command-"));
  try {
    const trace = startExecutionTrace(root, "run focused tests", { agent: "codex" });
    const result = runTraceCommand(root, trace.id, {
      action: "run-test",
      command: "node -e \"console.log('ok')\"",
      reason: "capture real command evidence"
    });
    const step = result.trace.steps.at(-1);
    assert.equal(result.exitCode, 0);
    assert.equal(step?.evidenceSource, "command");
    assert.equal(step?.capturedBy, "opencode-plusplus");
    assert.equal(step?.exitCode, 0);
    assert.match(step?.startedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.match(step?.finishedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.match(step?.stdoutHash ?? "", /^[a-f0-9]{64}$/);
    assert.match(step?.stderrHash ?? "", /^[a-f0-9]{64}$/);
    assert.match(step?.workingTreeHashBefore ?? "", /^[a-f0-9]{64}$/);
    assert.match(step?.workingTreeHashAfter ?? "", /^[a-f0-9]{64}$/);
    assert.match(renderExecutionTrace(result.trace), /exit 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execution trace duplicate writes do not append duplicate steps", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-trace-dedup-"));
  try {
    const trace = startExecutionTrace(root, "deduplicate evidence", { agent: "opencode" });
    const input = {
      action: "run-test",
      command: "npm run test",
      result: "passed" as const,
      at: "2026-01-01T00:00:10.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
      finishedAt: "2026-01-01T00:00:10.000Z",
      exitCode: 0,
      stdoutHash: "stdout",
      stderrHash: "stderr"
    };
    const first = appendExecutionTraceStep(root, trace.id, input);
    const second = appendExecutionTraceStep(root, trace.id, input);
    assert.equal(first.steps.length, second.steps.length);
    assert.equal(readExecutionTrace(root, trace.id)?.steps.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execution trace event IDs make retries idempotent", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-trace-event-id-"));
  try {
    const trace = startExecutionTrace(root, "event id retry");
    const first = appendExecutionTraceStep(root, trace.id, { eventId: "event-1", action: "edit" });
    const second = appendExecutionTraceStep(root, trace.id, { eventId: "event-1", action: "different-retry" });
    assert.equal(first.steps.length, 2);
    assert.equal(second.steps.length, 2);
    assert.equal(second.steps[1]?.action, "edit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execution trace run rejects shell control operators", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-trace-command-safe-"));
  try {
    const trace = startExecutionTrace(root, "run focused tests", { agent: "codex" });

    const result = runTraceCommand(root, trace.id, {
      action: "run-test",
      command: `node -e "console.log('ok')" && node -e "require('node:fs').writeFileSync('pwned.txt', '')"`,
      reason: "reject shell injection"
    });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Unsupported shell control operator/);
    assert.equal(result.trace.steps.at(-1)?.result, "failed");
    assert.equal(existsSync(path.join(root, "pwned.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("task run creates a matching execution trace", async () => {
  const root = createTraceRepo();
  try {
    const context = await buildContextPackage(root);
    const result = writeTaskRun(context, "fix login timeout bug", { type: "bugfix", base: "main" });
    const trace = readExecutionTrace(root, result.runId);

    assert.equal(result.manifest.traceFile, ".agent-context/traces/fix-login-timeout-bug.json");
    assert.ok(result.manifest.files.includes(result.manifest.traceFile));
    assert.equal(trace?.task, "fix login timeout bug");
    assert.equal(trace?.steps[0]?.action, "context-run-created");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createTraceRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-trace-run-"));
  mkdirSync(path.join(root, "src", "auth"), { recursive: true });
  mkdirSync(path.join(root, "test", "auth"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }), "utf8");
  writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'ok'; }\n", "utf8");
  writeFileSync(path.join(root, "test", "auth", "session.test.ts"), "import '../../src/auth/session.js';\n", "utf8");
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(root, ["config", "user.name", "Repo Context"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  return root;
}
