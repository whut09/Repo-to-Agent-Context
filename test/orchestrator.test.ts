import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runGit } from "../src/core/git.js";
import { readExecutionTrace } from "../src/harness/observability/execution-trace.js";
import { renderOrchestratorReport, runHarnessOrchestrator } from "../src/harness/control-plane/orchestrator.js";

test("harness orchestrator runs plan-pack-execute-evaluate-decision with mock executor", async () => {
  const root = createOrchestratorRepo();
  try {
    const result = await runHarnessOrchestrator(root, "fix login timeout bug", {
      executor: "mock",
      type: "bugfix",
      tokenBudget: 2000,
      base: "main"
    });
    const report = result.report;
    const rendered = renderOrchestratorReport(report);

    assert.equal(report.executor, "mock");
    assert.equal(report.taskId, "fix-login-timeout-bug");
    assert.deepEqual(report.phases, ["plan", "pack", "execute", "collect", "evaluate", "decision"]);
    assert.equal(report.executorResult.exitCode, 0);
    assert.equal(report.decision.action, "finalize");
    assert.equal(report.decision.blocking, false);
    assert.equal(report.decision.arbitration?.selectedCandidate.id, "fallback.finalize");
    assert.ok(report.artifacts.orchestratorFiles.includes(".agent-context/orchestrator/fix-login-timeout-bug/orchestrator.json"));
    assert.ok(existsSync(path.join(root, ".agent-context", "orchestrator", "fix-login-timeout-bug", "policy.md")));
    assert.ok(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "executor.mock.json")));
    assert.ok(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "iteration.json")));
    assert.ok(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "guard.findings.json")));
    assert.ok(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "guard.gates.json")));
    assert.match(rendered, /# Harness Orchestrator/);
    assert.match(rendered, /## Evidence Summary/);
    assert.match(rendered, /## Guard Gates/);
    assert.match(rendered, /## Decision Arbitration/);
    assert.match(rendered, /fallback\.finalize/);
    assert.match(rendered, /Decision: finalize/);

    const executorArtifact = JSON.parse(
      readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "executor.result.json"), "utf8")
    ) as { schemaVersion: string; kind: string; runId: string; iteration: number; summary: { executor: string; exitCode: number } };
    assert.equal(executorArtifact.schemaVersion, "opencode-plusplus.executor-result.v1");
    assert.equal(executorArtifact.kind, "executor-result");
    assert.equal(executorArtifact.runId, "fix-login-timeout-bug");
    assert.equal(executorArtifact.iteration, 1);
    assert.equal(executorArtifact.summary.executor, "mock");
    assert.equal(executorArtifact.summary.exitCode, 0);

    const decisionArtifact = JSON.parse(
      readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "decision.json"), "utf8")
    ) as {
      schemaVersion: string;
      kind: string;
      decision: { action: string; reasons: string[]; requiredCommands: string[] };
      arbitration: { selectedCandidate: { id: string }; selectedPriority: number; supportingCandidates: unknown[] };
      priorityOrder: Record<string, number>;
    };
    assert.equal(decisionArtifact.schemaVersion, "opencode-plusplus.decision.v1");
    assert.equal(decisionArtifact.kind, "decision");
    assert.equal(decisionArtifact.decision.action, "finalize");
    assert.ok(decisionArtifact.decision.reasons.length > 0);
    assert.equal(decisionArtifact.arbitration.selectedCandidate.id, "fallback.finalize");
    assert.equal(decisionArtifact.arbitration.selectedPriority, 10);

    const traceArtifact = JSON.parse(
      readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "trace.json"), "utf8")
    ) as {
      schemaVersion: string;
      kind: string;
      summary: { traceLoaded: boolean; steps: number };
    };
    assert.equal(traceArtifact.schemaVersion, "opencode-plusplus.trace-artifact.v1");
    assert.equal(traceArtifact.kind, "trace");
    assert.equal(traceArtifact.summary.traceLoaded, true);
    assert.ok(traceArtifact.summary.steps > 0);

    const guardArtifact = JSON.parse(
      readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "guard.findings.json"), "utf8")
    ) as { schemaVersion: string; kind: string; summary: { total: number }; findings: Array<{ schemaVersion: string; source: string }> };
    assert.equal(guardArtifact.schemaVersion, "opencode-plusplus.guard-findings.v1");
    assert.equal(guardArtifact.kind, "guard-findings");
    assert.equal(guardArtifact.summary.total, guardArtifact.findings.length);
    assert.ok(guardArtifact.findings.every((finding) => finding.schemaVersion === "opencode-plusplus.guard-finding.v1"));

    const gateArtifact = JSON.parse(
      readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "guard.gates.json"), "utf8")
    ) as { schemaVersion: string; kind: string; summary: { total: number }; gates: Array<{ guard: string; action: string; condition: string }> };
    assert.equal(gateArtifact.schemaVersion, "opencode-plusplus.guard-gates.v1");
    assert.equal(gateArtifact.kind, "guard-gates");
    assert.equal(gateArtifact.summary.total, gateArtifact.gates.length);
    assert.ok(gateArtifact.gates.every((gate) => gate.guard && gate.action && gate.condition));

    const trace = readExecutionTrace(root, report.traceId);
    assert.ok(trace);
    assert.ok(trace.steps.some((step) => step.action === "agent-execute"));
    assert.equal(trace.steps.at(-1)?.evidenceSource, "manual");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harness orchestrator blocks when a selected executor has no command adapter", async () => {
  const root = createOrchestratorRepo();
  try {
    const result = await runHarnessOrchestrator(root, "fix login timeout bug", {
      executor: "opencode",
      type: "bugfix",
      tokenBudget: 2000,
      base: "main"
    });

    assert.equal(result.report.executor, "opencode");
    assert.equal(result.report.executorResult.exitCode, 2);
    assert.equal(result.report.decision.action, "block");
    assert.equal(result.report.convergence.status, "executor-failure");
    assert.equal(result.report.convergence.stopReason, "executor-failure");
    assert.match(result.report.executorResult.stderr, /No executor command configured/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harness orchestrator treats injected shell syntax as plain executor template data", async () => {
  const root = createOrchestratorRepo();
  try {
    const maliciousTask = "fix login timeout bug $(touch pwned-task.txt) `touch pwned-backtick.txt`";
    const result = await runHarnessOrchestrator(root, maliciousTask, {
      executor: "opencode",
      executorCommand: `node -e "console.log(process.argv[1])" {task}`,
      type: "bugfix",
      tokenBudget: 2000,
      base: "main"
    });

    assert.equal(result.report.executorResult.exitCode, 0);
    assert.match(result.report.taskId, /^fix-login-timeout-bug/);
    assert.match(result.report.executorResult.stdout, /\$\(touch pwned-task\.txt\)/);
    assert.equal(existsSync(path.join(root, "pwned-task.txt")), false);
    assert.equal(existsSync(path.join(root, "pwned-backtick.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harness orchestrator writes multi-loop iteration artifacts before max-loop review", async () => {
  const root = createOrchestratorRepo();
  try {
    const source = Buffer.from("export function loginSession() { return 'fixed'; }\n").toString("base64");
    const command = `node -e "require('fs').writeFileSync('src/auth/session.ts', Buffer.from('${source}', 'base64').toString())" {prompt}`;
    const result = await runHarnessOrchestrator(root, "fix login timeout bug", {
      executor: "opencode",
      executorCommand: command,
      type: "bugfix",
      tokenBudget: 2000,
      base: "main",
      maxLoops: 2,
      checkpoint: "git-worktree"
    });

    assert.equal(result.report.executor, "opencode");
    assert.equal(result.report.sandbox.mode, "git-worktree");
    assert.equal(result.report.sandbox.discarded, true);
    assert.equal(existsSync(result.report.sandbox.root), false);
    assert.equal(result.report.sandbox.gatewayDir, ".agent-context/worktrees/fix-login-timeout-bug");
    assert.equal(result.report.sandbox.manifestPath, ".agent-context/worktrees/fix-login-timeout-bug/manifest.json");
    assert.equal(result.report.sandbox.patchPath, ".agent-context/worktrees/fix-login-timeout-bug/diff.patch");
    assert.equal(result.report.sandbox.applyCommand, "git apply .agent-context/worktrees/fix-login-timeout-bug/diff.patch");
    assert.match(
      result.report.iterations[0]?.executorResult.command ?? "",
      /worktree[\\/]\.agent-context[\\/]executor-prompts[\\/]fix-login-timeout-bug[\\/]001/
    );
    assert.ok(existsSync(path.join(root, ".agent-context", "worktrees", "fix-login-timeout-bug", "manifest.json")));
    assert.ok(existsSync(path.join(root, ".agent-context", "worktrees", "fix-login-timeout-bug", "diff.patch")));
    assert.equal(result.report.iterations.length, 2);
    assert.equal(result.report.iterations[0]?.decision.action, "repack");
    assert.equal(result.report.decision.action, "human-review");
    assert.ok(result.report.artifacts.checkpointFile?.endsWith("checkpoint.patch"));
    assert.ok(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "prompt.md")));
    assert.ok(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "executor.events.jsonl")));
    assert.ok(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "002", "decision.json")));
    assert.match(readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "diff.opencode.patch"), "utf8"), /fixed/);
    assert.match(readFileSync(path.join(root, "src", "auth", "session.ts"), "utf8"), /return 'ok'/);
    const secondPrompt = readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "002", "prompt.md"), "utf8");
    assert.match(secondPrompt, /Previous harness decision/);
    assert.match(secondPrompt, /Action: repack/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harness orchestrator stops on repeated blocking state with no progress", async () => {
  const root = createOrchestratorRepo();
  try {
    const result = await runHarnessOrchestrator(root, "fix login timeout bug", {
      executor: "mock",
      type: "bugfix",
      tokenBudget: 1,
      base: "main",
      maxLoops: 3
    });

    assert.equal(result.report.iterations.length, 2);
    assert.equal(result.report.decision.action, "human-review");
    assert.equal(result.report.convergence.status, "repeated-state");
    assert.equal(result.report.convergence.stopReason, "repeated-state/no-progress");
    assert.equal(result.report.iterations[0]?.convergence.status, "progressing");
    assert.equal(result.report.iterations[1]?.convergence.status, "repeated-state");
    assert.equal(result.report.iterations[0]?.convergence.fingerprint.value, result.report.iterations[1]?.convergence.fingerprint.value);
    assert.ok(result.report.decision.reasons.some((reason) => reason.includes("repeated-state/no-progress")));

    const iteration = JSON.parse(
      readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "002", "iteration.json"), "utf8")
    ) as { convergence: { status: string; fingerprint: { value: string } } };
    const report = JSON.parse(readFileSync(path.join(root, ".agent-context", "orchestrator", "fix-login-timeout-bug", "orchestrator.json"), "utf8")) as {
      convergence: { status: string; fingerprint: { value: string } };
    };
    assert.equal(iteration.convergence.status, "repeated-state");
    assert.equal(iteration.convergence.fingerprint.value, result.report.convergence.fingerprint.value);
    assert.equal(report.convergence.status, "repeated-state");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harness orchestrator reports max-loop for a single blocking iteration", async () => {
  const root = createOrchestratorRepo();
  try {
    const result = await runHarnessOrchestrator(root, "fix login timeout bug", {
      executor: "mock",
      type: "bugfix",
      tokenBudget: 1,
      base: "main",
      maxLoops: 1
    });

    assert.equal(result.report.iterations.length, 1);
    assert.equal(result.report.decision.action, "human-review");
    assert.equal(result.report.convergence.status, "max-loops-reached");
    assert.equal(result.report.convergence.stopReason, "max-loops-reached");
    assert.equal(result.report.convergence.repeated, false);
    assert.ok(result.report.decision.reasons.some((reason) => reason.includes("Maximum orchestrator loop count")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harness orchestrator normalizes OpenCode JSON stdout into execution trace", async () => {
  const root = createOrchestratorRepo();
  try {
    const command = [
      "node",
      "-e",
      `"console.log(JSON.stringify({type:'message.part.updated',part:{type:'text',text:'reading auth'}}));console.log(JSON.stringify({type:'tool.call',name:'Read',args:{path:'src/auth/session.ts'}}));console.log(JSON.stringify({type:'tool.call',name:'Bash',args:{command:'npm run test -- auth'},exitCode:0}));"`
    ].join(" ");
    const result = await runHarnessOrchestrator(root, "fix login timeout bug", {
      executor: "opencode",
      executorCommand: command,
      type: "bugfix",
      tokenBudget: 2000,
      base: "main"
    });

    const trace = readExecutionTrace(root, result.report.traceId);
    assert.ok(trace?.steps.some((step) => step.action === "message" && step.output?.includes("reading auth")));
    assert.ok(trace?.steps.some((step) => step.action === "file-read" && step.files.includes("src/auth/session.ts")));
    assert.ok(trace?.steps.some((step) => step.action === "run-test" && step.command === "npm run test -- auth"));
    assert.equal(result.report.executorResult.normalizerSource, "opencode-json");
    assert.ok((result.report.executorResult.normalizedEventsCount ?? 0) >= 3);
    const eventLog = readFileSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "iterations", "001", "executor.events.jsonl"), "utf8");
    assert.match(eventLog, /file_read/);
    assert.match(eventLog, /test_run/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createOrchestratorRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-orchestrator-"));
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
