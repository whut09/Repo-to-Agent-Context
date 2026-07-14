import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildContextPackage } from "../src/core/context-builder.js";
import { runGit } from "../src/core/git.js";
import { appendExecutionTraceStep, runTraceCommand, startExecutionTrace } from "../src/harness/observability/execution-trace.js";
import { buildLoopControllerReport, renderLoopControllerReport, writeLoopControllerReport } from "../src/harness/control-plane/loop-controller.js";
import { writeContextPackage } from "../src/outputs/renderers/writer.js";

test("loop controller starts the agent from a clean preflight", async () => {
  const root = createLoopRepo();
  try {
    await prepareGeneratedContext(root);

    const context = await buildContextPackage(root);
    const report = buildLoopControllerReport(context, "fix login timeout bug", { phase: "preflight", type: "bugfix", base: "main" });
    const rendered = renderLoopControllerReport(report);

    assert.equal(report.status, "ready");
    assert.equal(report.changedFiles.length, 0);
    const decision = report.decisions.find((item) => item.action === "start-agent");
    assert.ok(decision);
    assert.equal(decision.blocking, false);
    assert.equal(typeof decision.confidence, "number");
    assert.ok(decision.confidence > 0 && decision.confidence <= 1);
    assert.ok(decision.signals.includes("changed files: 0"));
    assert.match(rendered, /# Loop Controller/);
    assert.match(rendered, /confidence 0\.\d+/);
    assert.match(rendered, /non-blocking/);
    assert.match(rendered, /opencode-plusplus run "fix login timeout bug"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loop controller asks for context refresh and tests after source edits", async () => {
  const root = createLoopRepo();
  try {
    await prepareGeneratedContext(root);
    writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'fixed'; }\n", "utf8");

    const context = await buildContextPackage(root);
    const report = buildLoopControllerReport(context, "fix login timeout bug", { phase: "after-edit", type: "bugfix", base: "main" });
    const result = writeLoopControllerReport(context, "fix login timeout bug", { phase: "after-edit", type: "bugfix", base: "main" });

    assert.ok(report.changedFiles.includes("src/auth/session.ts"));
    assert.ok(report.decisions.some((decision) => decision.action === "rebuild-context"));
    const testDecision = report.decisions.find((decision) => decision.action === "run-tests");
    assert.ok(testDecision);
    assert.equal(testDecision.blocking, true);
    assert.ok(testDecision.confidence >= 0.8);
    assert.ok(testDecision.signals.some((signal) => signal.startsWith("changed files:")));
    assert.ok(testDecision.signals.some((signal) => signal.startsWith("minimal tests detected:")));
    assert.ok(existsSync(path.join(result.dir, "loop.md")));
    assert.ok(existsSync(path.join(result.dir, "loop.json")));
    const statePath = path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "state.json");
    assert.ok(existsSync(statePath));
    const state = JSON.parse(readFileSync(statePath, "utf8")) as { state: string; nextAction: { type: string }; missingEvidence: string[] };
    assert.equal(state.state, "BLOCKED");
    assert.equal(state.nextAction.type, "build_context");
    assert.ok(state.missingEvidence.includes("context_fresh"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loop controller consumes passed test trace evidence", async () => {
  const root = createLoopRepo();
  try {
    await prepareGeneratedContext(root);
    writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'fixed'; }\n", "utf8");
    const updatedContext = await buildContextPackage(root);
    writeContextPackage(updatedContext);

    const trace = startExecutionTrace(root, "fix login timeout bug", { agent: "codex" });
    appendExecutionTraceStep(root, trace.id, {
      action: "run-test",
      command: "npm test -- test/auth/session.test.ts",
      result: "passed"
    });

    const context = await buildContextPackage(root);
    const report = buildLoopControllerReport(context, "fix login timeout bug", { phase: "after-edit", type: "bugfix", base: "main", traceId: trace.id });
    const balancedReport = buildLoopControllerReport(context, "fix login timeout bug", {
      phase: "after-edit",
      type: "bugfix",
      base: "main",
      traceId: trace.id,
      evidencePolicy: "balanced"
    });
    const rendered = renderLoopControllerReport(report);

    assert.equal(report.trace.loaded, true);
    assert.equal(report.trace.passedTestEvidence, "manual");
    assert.equal(report.status, "ready");
    assert.equal(balancedReport.trace.passedTestEvidence, "none");
    assert.ok(balancedReport.decisions.some((decision) => decision.action === "run-tests"));
    assert.ok(report.changedFiles.includes("src/auth/session.ts"));
    assert.ok(!report.decisions.some((decision) => decision.action === "run-tests"));
    assert.ok(report.decisions.some((decision) => decision.action === "ready-for-review"));
    assert.equal(report.runtime.state, "READY_FOR_REVIEW");
    assert.equal(report.runtime.nextAction.type, "review");
    assert.ok(report.runtime.satisfiedEvidence.includes("required_tests_passed"));
    assert.match(rendered, /Passed test evidence/);
    assert.match(rendered, /Runtime State/);
    assert.match(rendered, /passed test trace: manual/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loop controller rejects stale test evidence after later edits", async () => {
  const root = createLoopRepo();
  try {
    await prepareGeneratedContext(root);
    writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'first edit'; }\n", "utf8");
    const trace = startExecutionTrace(root, "fix login timeout bug", { agent: "codex" });
    runTraceCommand(root, trace.id, {
      action: "run-test",
      command: "npm run test",
      reason: "test command evidence"
    });
    writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'second edit'; }\n", "utf8");
    const updatedContext = await buildContextPackage(root);
    writeContextPackage(updatedContext);

    const context = await buildContextPackage(root);
    const report = buildLoopControllerReport(context, "fix login timeout bug", { phase: "after-edit", type: "bugfix", base: "main", traceId: trace.id });

    assert.equal(report.trace.loaded, true);
    assert.equal(report.trace.passedTestEvidence, "none");
    assert.ok(report.decisions.some((decision) => decision.action === "run-tests"));
    assert.ok(report.trace.signals.some((signal) => signal.includes("Working tree hash is stale")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createLoopRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-loop-"));
  mkdirSync(path.join(root, "src", "auth"), { recursive: true });
  mkdirSync(path.join(root, "test", "auth"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('ok')\"", check: "tsc --noEmit" } }), "utf8");
  writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'ok'; }\n", "utf8");
  writeFileSync(path.join(root, "test", "auth", "session.test.ts"), "import { loginSession } from '../../src/auth/session.js';\nloginSession();\n", "utf8");
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(root, ["config", "user.name", "Repo Context"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  return root;
}

async function prepareGeneratedContext(root: string): Promise<void> {
  const context = await buildContextPackage(root);
  writeContextPackage(context);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "generated context"]);
}
