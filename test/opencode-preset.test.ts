import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runGit } from "../src/core/git.js";
import type { HarnessOrchestratorReport } from "../src/harness/control-plane/orchestrator.js";
import {
  findOpencodeReport,
  initOpencodeProject,
  OPENCODE_DEFAULT_EXECUTOR_COMMAND,
  renderOpencodeInitReport,
  renderOpencodeRunSummary,
  runOpencodeDoctor
} from "../src/cli/opencode-preset.js";

test("OpenCode preset uses the requested default executor command", () => {
  assert.equal(OPENCODE_DEFAULT_EXECUTOR_COMMAND, 'opencode run --format json --dir {repo} "Follow the attached OpenCode++ task prompt." --file {prompt}');
  assert.ok(OPENCODE_DEFAULT_EXECUTOR_COMMAND.indexOf('"Follow the attached OpenCode++ task prompt."') < OPENCODE_DEFAULT_EXECUTOR_COMMAND.indexOf("--file"));
});

test("OpenCode doctor reports a ready repo when OpenCode, auth, git, context, and clean tree checks pass", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-opencode-doctor-"));
  const bin = path.join(root, "bin");
  const oldPath = process.env.PATH;
  try {
    mkdirSync(bin, { recursive: true });
    writeFakeOpenCode(bin);
    process.env.PATH = `${bin}${path.delimiter}${oldPath ?? ""}`;

    mkdirSync(path.join(root, ".agent-context"), { recursive: true });
    writeFileSync(path.join(root, ".agent-context", "README.md"), "generated context\n", "utf8");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('ok')\"" } }), "utf8");
    runGit(root, ["init"]);
    runGit(root, ["checkout", "-b", "main"]);
    runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
    runGit(root, ["config", "user.name", "OpenCode Plus Plus"]);
    runGit(root, ["add", "."]);
    runGit(root, ["commit", "-m", "initial"]);

    const report = runOpencodeDoctor(root);

    assert.equal(report.ok, true);
    assert.equal(report.checks.find((check) => check.id === "opencode-installed")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "opencode-run")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "opencode-auth")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "git-repo")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "agent-context")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "working-tree-clean")?.status, "pass");
  } finally {
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenCode init writes only the project agent without overwriting by default", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-opencode-init-"));
  try {
    const first = initOpencodeProject(root);

    assert.deepEqual(
      first.files.map((file) => `${file.path}:${file.status}`),
      [".opencode/agents/opencode-plusplus.md:written"]
    );
    const agentFile = path.join(root, ".opencode", "agents", "opencode-plusplus.md");
    const agentContent = readFileSync(agentFile, "utf8");
    assert.match(agentContent, /mode: primary/);
    assert.match(agentContent, /opencode_plusplus_prepare/);
    assert.doesNotMatch(agentContent, /\/plusplus-task|\/plusplus-verify/);
    writeFileSync(agentFile, "custom\n", "utf8");
    const second = initOpencodeProject(root);

    assert.equal(second.files.find((file) => file.path === ".opencode/agents/opencode-plusplus.md")?.status, "skipped");
    assert.equal(readFileSync(agentFile, "utf8"), "custom\n");

    const forced = initOpencodeProject(root, { force: true });

    assert.equal(forced.files.find((file) => file.path === ".opencode/agents/opencode-plusplus.md")?.status, "written");
    assert.notEqual(readFileSync(agentFile, "utf8"), "custom\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenCode init dry-run reports files without writing them", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-opencode-init-dry-"));
  try {
    const report = initOpencodeProject(root, { dryRun: true });
    const rendered = renderOpencodeInitReport(report);

    assert.ok(report.files.every((file) => file.status === "would-write"));
    assert.equal(existsSync(path.join(root, ".opencode")), false);
    assert.match(rendered, /OpenCode\+\+ OpenCode Init/);
    assert.match(rendered, /Select the opencode-plusplus mode/);
    assert.doesNotMatch(rendered, /Legacy aliases/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenCode run summary keeps the terminal output compact and actionable", () => {
  const report = createReportFixture();
  const rendered = renderOpencodeRunSummary(report);

  assert.match(rendered, /OpenCode\+\+ OpenCode Run/);
  assert.match(rendered, /Task: fix login timeout bug/);
  assert.match(rendered, /Decision: repair/);
  assert.match(rendered, /Confidence: 0\.72/);
  assert.match(rendered, /- src\/auth\/session\.ts/);
  assert.match(rendered, /- Evidence Guard: no test command after last edit/);
  assert.match(rendered, / {2}opencode-plusplus oc repair/);
  assert.match(rendered, / {2}opencode-plusplus oc report --last/);
});

test("OpenCode run summary explains executor failures", () => {
  const report = createReportFixture();
  report.executorResult.exitCode = 1;
  report.executorResult.stderr = "Command produced no output for 180000ms.";
  report.changedFiles = [];
  report.gates.gates = [];
  report.decision = {
    action: "block",
    blocking: true,
    confidence: 0.94,
    reasons: ["The selected executor failed before the harness could trust the result."],
    requiredCommands: [],
    artifacts: []
  };

  const rendered = renderOpencodeRunSummary(report);

  assert.match(rendered, /Executor failure:/);
  assert.match(rendered, /stderr: Command produced no output for 180000ms/);
  assert.match(rendered, /- Executor: failed before OpenCode\+\+ could trust the result/);
  assert.doesNotMatch(rendered, /Blocking gates:\n- none/);
});

test("OpenCode report lookup returns the latest OpenCode orchestrator report", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-opencode-report-"));
  try {
    const oldDir = path.join(root, ".agent-context", "orchestrator", "old-task");
    const newDir = path.join(root, ".agent-context", "orchestrator", "new-task");
    mkdirSync(oldDir, { recursive: true });
    mkdirSync(newDir, { recursive: true });
    writeFileSync(path.join(oldDir, "orchestrator.json"), JSON.stringify({ ...createReportFixture(), taskId: "old-task", task: "old" }), "utf8");
    writeFileSync(path.join(newDir, "orchestrator.json"), JSON.stringify({ ...createReportFixture(), taskId: "new-task", task: "new" }), "utf8");

    const result = findOpencodeReport(root, { last: true });

    assert.equal(result?.report.taskId, "new-task");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFakeOpenCode(bin: string): void {
  if (process.platform === "win32") {
    writeFileSync(
      path.join(bin, "opencode.cmd"),
      [
        "@echo off",
        'if "%1"=="--version" echo opencode 0.0.0-test& exit /b 0',
        'if "%1"=="run" if "%2"=="--help" echo opencode run help& exit /b 0',
        'if "%1"=="auth" if "%2"=="list" echo test-provider& exit /b 0',
        "echo unsupported %*& exit /b 1"
      ].join("\r\n"),
      "utf8"
    );
    return;
  }

  const script = path.join(bin, "opencode");
  writeFileSync(
    script,
    [
      "#!/usr/bin/env sh",
      'if [ "$1" = "--version" ]; then echo \'opencode 0.0.0-test\'; exit 0; fi',
      'if [ "$1" = "run" ] && [ "$2" = "--help" ]; then echo \'opencode run help\'; exit 0; fi',
      'if [ "$1" = "auth" ] && [ "$2" = "list" ]; then echo \'test-provider\'; exit 0; fi',
      'echo "unsupported $*" >&2',
      "exit 1"
    ].join("\n"),
    "utf8"
  );
  chmodSync(script, 0o755);
}

function createReportFixture(): HarnessOrchestratorReport {
  return {
    task: "fix login timeout bug",
    taskId: "fix-login-timeout-bug",
    repo: "/repo",
    base: "main",
    executor: "opencode",
    runDir: ".agent-context/runs/fix-login-timeout-bug",
    traceId: "fix-login-timeout-bug",
    maxLoops: 3,
    dryRun: false,
    phases: ["plan", "pack", "execute", "collect", "evaluate", "decision"],
    executorResult: {
      executor: "opencode",
      exitCode: 0,
      stdout: "",
      stderr: "",
      changedFiles: ["src/auth/session.ts", "test/auth/session.test.ts"]
    },
    changedFiles: ["src/auth/session.ts", "test/auth/session.test.ts"],
    iterations: [],
    policy: {
      passed: false,
      failOn: "required",
      summary: { forbidden: 0, requiredMissing: 1, risks: 0, requiredSatisfied: 0 }
    },
    loop: {
      status: "needs-repair",
      risk: "Medium",
      trace: {
        loaded: true,
        passedTestEvidence: "none",
        signals: []
      },
      checks: {
        contracts: "failed",
        contractViolations: 1,
        minimalTests: 1,
        regressionTests: 0,
        impactDependents: 0
      },
      decisions: []
    },
    gates: {
      summary: {
        total: 1,
        blocking: 1,
        warnings: 0,
        passed: 0,
        byGuard: {
          context: { blocking: 0, warnings: 0, passed: 0 },
          boundary: { blocking: 0, warnings: 0, passed: 0 },
          evidence: { blocking: 1, warnings: 0, passed: 0 },
          hallucination: { blocking: 0, warnings: 0, passed: 0 },
          regression: { blocking: 0, warnings: 0, passed: 0 }
        }
      },
      gates: [
        {
          id: "evidence.no-test-after-edit",
          guard: "evidence",
          condition: "no test command after last edit",
          status: "blocked",
          severity: "blocker",
          action: "run-tests",
          evidence: [],
          findingIds: []
        }
      ]
    },
    decision: {
      action: "repair",
      blocking: true,
      confidence: 0.72,
      reasons: ["tests were run before final edit"],
      requiredCommands: ["npm test -- auth"],
      artifacts: []
    },
    convergence: {
      schemaVersion: "opencode-plusplus.convergence.v1",
      status: "progressing",
      fingerprint: {
        schemaVersion: "opencode-plusplus.iteration-fingerprint.v1",
        value: "fixture-fingerprint",
        state: {
          workingTreeHash: "fixture-tree",
          decisionAction: "repair",
          blockingFindingIds: [],
          blockingGateIds: ["evidence.no-test-after-edit"],
          missingEvidence: ["required_tests_passed"],
          requiredCommands: ["npm test -- auth"],
          contextFreshness: "fresh",
          contextDrift: "clean"
        }
      },
      repeated: false,
      shouldStop: false
    },
    artifacts: {
      contextFiles: [],
      runFiles: [],
      orchestratorFiles: [".agent-context/orchestrator/fix-login-timeout-bug/orchestrator.md"],
      iterationFiles: []
    },
    sandbox: {
      mode: "host",
      root: "/repo",
      discarded: false,
      initialPatch: false
    }
  };
}
