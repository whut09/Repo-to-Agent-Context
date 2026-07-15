import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildContextPackage } from "../core/context-builder.js";
import { changedFilesSince, runGit } from "../core/git.js";
import { runSafeCommand, shellQuote } from "../core/safe-command.js";
import { normalizeAgentEvents } from "../outputs/agent-events.js";
import { appendExecutionTraceStep, currentWorkingTreeHash, readExecutionTrace, startExecutionTrace } from "../harness/observability/execution-trace.js";
import { buildHallucinationReport } from "../harness/verification-plane/guards/hallucination.js";
import { buildLoopControllerReport } from "../harness/control-plane/loop-controller.js";
import { buildPolicyReport, type PolicyFailOn } from "../harness/verification-plane/policy-engine.js";
import { buildRegressionReport } from "../harness/verification-plane/guards/regression.js";
import { writeTaskRun } from "../outputs/task-run.js";
import { writeContextPackage } from "../outputs/renderers/writer.js";
import { runHarnessOrchestrator, type AgentExecutorName, type OrchestratorDecision } from "../harness/control-plane/orchestrator.js";
import { code, heading, table } from "../outputs/renderers/markdown.js";
import type { AgentRunMode, BenchmarkTaskDefinition } from "./benchmark.js";

export type AgentBenchmarkFinalDecision = OrchestratorDecision | "weak-pass" | "weak-block";
export type AgentBenchmarkGate = "weak" | "medium" | "strong" | "blocked";

export interface AgentBehaviorBenchmarkOptions {
  benchmarkDir?: string;
  executor?: AgentExecutorName;
  executorCommand?: string;
  agent?: string;
  maxLoops?: number;
  failOn?: PolicyFailOn;
  base?: string;
  dryRun?: boolean;
  keepWorkdirs?: boolean;
  modes?: AgentRunMode[];
  taskIds?: string[];
  seed?: number;
  repetition?: number;
}

export interface AgentBehaviorBenchmarkRun {
  taskId: string;
  fixture: string;
  task: string;
  mode: AgentRunMode;
  executor: AgentExecutorName;
  workdir: string;
  changedFiles: string[];
  unrelatedChanges: number;
  forbiddenFilesChanged: number;
  passedTests: boolean;
  missingEvidence: number;
  testsMissing: number;
  testsFailed: number;
  hallucinatedCommands: number;
  loopCount: number;
  iterationsToFinish: number;
  finalDecision: AgentBenchmarkFinalDecision;
  finalGate: AgentBenchmarkGate;
  finalDecisionAccuracy: boolean;
  humanReviewNeeded: boolean;
  hallucinationFindings: number;
  regressionFindings: number;
  exitCode: number | null;
  repetition?: number;
  seed?: number;
  elapsedMs?: number;
  commandCount?: number;
  tokenUsage?: number | null;
  estimatedCostUsd?: number | null;
  promptHash?: string;
  noProgress?: boolean;
  success?: boolean;
}

export interface AgentBehaviorModeSummary {
  mode: AgentRunMode;
  runs: number;
  wrongEdits: number;
  forbiddenEdits: number;
  staleEvidence: number;
  testsMissing: number;
  testsFailed: number;
  hallucinatedCommands: number;
  testPassRate: number;
  loops: number;
  finalDecisionAccuracy: number;
  humanReviewNeeded: number;
  finalGate: AgentBenchmarkGate;
}

export interface AgentBehaviorBenchmarkResult {
  kind: "deterministic-proxy" | "executor-run";
  benchmarkDir: string;
  executor: AgentExecutorName;
  modes: AgentRunMode[];
  tasks: number;
  runs: AgentBehaviorBenchmarkRun[];
  summary: AgentBehaviorModeSummary[];
}

const DEFAULT_MODES: AgentRunMode[] = ["no-context", "agents-md", "context-pack", "loop-enabled-harness"];

export async function runAgentBehaviorBenchmark(options: AgentBehaviorBenchmarkOptions = {}): Promise<AgentBehaviorBenchmarkResult> {
  const benchmarkDir = path.resolve(options.benchmarkDir ?? "benchmarks");
  const executor = options.executor ?? "mock";
  const modes = options.modes?.length ? options.modes : DEFAULT_MODES;
  const tasks = readTasks(path.join(benchmarkDir, "tasks")).filter((task) => !options.taskIds?.length || options.taskIds.includes(task.id));
  const runs: AgentBehaviorBenchmarkRun[] = [];

  for (const task of tasks) {
    for (const mode of modes) {
      runs.push(await runAgentModeBenchmark(benchmarkDir, task, mode, executor, options));
    }
  }

  return {
    kind: executor === "mock" || options.dryRun ? "deterministic-proxy" : "executor-run",
    benchmarkDir,
    executor,
    modes,
    tasks: tasks.length,
    runs,
    summary: summarizeAgentBehavior(runs, modes)
  };
}

export function renderAgentBehaviorBenchmark(result: AgentBehaviorBenchmarkResult): string {
  return [
    heading(1, result.kind === "deterministic-proxy" ? "Deterministic Agent Benchmark Proxy" : "Executor Agent Behavior Benchmark"),
    "",
    `Benchmark dir: ${code(result.benchmarkDir)}`,
    `Executor: ${result.executor}`,
    `Tasks: ${result.tasks}`,
    `Runs: ${result.runs.length}`,
    `Metric class: ${result.kind}`,
    "",
    heading(2, "Mode Comparison"),
    table(
      [
        "Mode",
        "Wrong files",
        "Forbidden",
        "Tests missing",
        "Tests failed",
        "Hallucinated commands",
        "Iterations",
        "Decision accuracy",
        "Human review",
        "Final gate"
      ],
      result.summary.map((item) => [
        displayMode(item.mode),
        item.wrongEdits.toFixed(1),
        item.forbiddenEdits.toFixed(1),
        item.testsMissing.toFixed(1),
        item.testsFailed.toFixed(1),
        item.hallucinatedCommands.toFixed(1),
        item.loops.toFixed(1),
        percent(item.finalDecisionAccuracy),
        percent(item.humanReviewNeeded),
        item.finalGate
      ])
    ),
    "",
    heading(2, "Run Details"),
    table(
      ["Task", "Fixture", "Mode", "Changed", "Wrong", "Forbidden", "Missing tests", "Failed tests", "Hallucinated commands", "Decision", "Human review"],
      result.runs.map((run) => [
        run.taskId,
        run.fixture,
        displayMode(run.mode),
        String(run.changedFiles.length),
        String(run.unrelatedChanges),
        String(run.forbiddenFilesChanged),
        String(run.testsMissing),
        String(run.testsFailed),
        String(run.hallucinatedCommands),
        run.finalDecision,
        run.humanReviewNeeded ? "yes" : "no"
      ])
    ),
    "",
    heading(2, "Interpretation"),
    result.kind === "deterministic-proxy"
      ? "- These are deterministic mock proxy metrics and must not be reported as real executor success or cost."
      : "- These runs use an external executor; use benchmark-agent-real for repeated statistical evaluation.",
    "- A no-context: task only.",
    "- B AGENTS.md: task plus root operating guide.",
    "- C context-pack: task plus task-aware pack and edit boundary.",
    "- D harness-led: OpenCode++ owns the loop and the code agent is only the executor.",
    "- `mock` and `--dry-run` validate the benchmark harness without editing fixtures.",
    "- Core Phase 6 metrics: wrong files changed, forbidden files changed, tests missing, tests failed, hallucinated commands, iterations to finish, final decision accuracy, and human review needed.",
    '- Real OpenCode runs can be recorded with `--executor opencode --executor-command "opencode run --format json --dir {repo} --file {prompt} \\"Follow the attached OpenCode++ task prompt.\\""`.'
  ].join("\n");
}

async function runAgentModeBenchmark(
  benchmarkDir: string,
  task: BenchmarkTaskDefinition,
  mode: AgentRunMode,
  executor: AgentExecutorName,
  options: AgentBehaviorBenchmarkOptions
): Promise<AgentBehaviorBenchmarkRun> {
  const startedAtMs = Date.now();
  const executionOptions: AgentBehaviorBenchmarkOptions = {
    ...options,
    executorCommand: options.executorCommand?.replaceAll("{seed}", String(options.seed ?? 0))
  };
  if (options.dryRun && executor === "mock") {
    return finalizeRunTelemetry(mockDryRunAgentModeBenchmark(benchmarkDir, task, mode, executor), options, Date.now() - startedAtMs);
  }

  const workspace = mkdtempSync(path.join(tmpdir(), `opencode-plusplus-agent-benchmark-${task.id}-${mode}-`));
  const repo = path.join(workspace, task.fixture);
  cpSync(path.join(benchmarkDir, "fixtures", task.fixture), repo, { recursive: true });
  mkdirSync(path.join(repo, ".agent-context", "agent-benchmark"), { recursive: true });

  if (mode !== "no-context") {
    const context = await buildContextPackage(repo);
    writeContextPackage(context);
  }

  initBaseline(repo, options.base ?? "main");

  const result =
    mode === "loop-enabled-harness"
      ? await runHarnessMode(repo, task, executor, executionOptions)
      : await runDirectMode(repo, task, mode, executor, executionOptions);

  if (!options.keepWorkdirs) rmSync(workspace, { recursive: true, force: true });
  return finalizeRunTelemetry(result, options, Date.now() - startedAtMs);
}

function mockDryRunAgentModeBenchmark(
  benchmarkDir: string,
  task: BenchmarkTaskDefinition,
  mode: AgentRunMode,
  executor: AgentExecutorName
): AgentBehaviorBenchmarkRun {
  const modeRank: Record<AgentRunMode, number> = {
    "no-context": 0,
    "agents-md": 1,
    "context-pack": 2,
    "loop-enabled-harness": 3
  };
  const rank = modeRank[mode];
  const isHallucinationTask = /hallucinat/i.test(task.id);
  const isProtectedTask = /protected/i.test(task.id);
  const isRegressionTask = /regression/i.test(task.id);
  const changedFiles =
    rank >= 2 ? task.changedFiles : rank === 1 ? task.changedFiles.slice(0, Math.max(1, task.changedFiles.length - 1)) : ["unrelated/file.ts"];
  const forbiddenFilesChanged = isProtectedTask && rank < 2 ? 1 : 0;
  const hallucinatedCommands = isHallucinationTask && rank < 2 ? 1 : 0;
  const testsMissing = rank < 2 || (isRegressionTask && rank < 2) ? 1 : 0;
  const testsFailed = rank === 0 ? 1 : 0;
  const expectedBlock = forbiddenFilesChanged > 0 || hallucinatedCommands > 0 || testsMissing > 0 || testsFailed > 0;
  const finalGate: AgentBenchmarkGate = rank === 3 ? "strong" : rank === 2 ? "medium" : "blocked";
  const finalDecision: AgentBenchmarkFinalDecision = rank === 3 ? "finalize" : rank === 2 ? "weak-pass" : "weak-block";

  return {
    taskId: task.id,
    fixture: task.fixture,
    task: task.task,
    mode,
    executor,
    workdir: path.join(benchmarkDir, "fixtures", task.fixture),
    changedFiles,
    unrelatedChanges: rank >= 2 ? 0 : rank === 1 ? 1 : Math.max(1, task.changedFiles.length),
    forbiddenFilesChanged,
    passedTests: rank >= 2,
    missingEvidence: testsMissing,
    testsMissing,
    testsFailed,
    hallucinatedCommands,
    loopCount: rank === 3 ? 2 : rank === 2 ? 3 : rank === 1 ? 4 : 6,
    iterationsToFinish: rank === 3 ? 2 : rank === 2 ? 3 : rank === 1 ? 4 : 6,
    finalDecision,
    finalGate,
    finalDecisionAccuracy: expectedBlock ? rank < 2 : rank >= 2,
    humanReviewNeeded: expectedBlock,
    hallucinationFindings: hallucinatedCommands,
    regressionFindings: isRegressionTask ? 1 : 0,
    exitCode: testsFailed ? 1 : 0
  };
}

async function runHarnessMode(
  repo: string,
  task: BenchmarkTaskDefinition,
  executor: AgentExecutorName,
  options: AgentBehaviorBenchmarkOptions
): Promise<AgentBehaviorBenchmarkRun> {
  const result = await runHarnessOrchestrator(repo, task.task, {
    executor,
    executorCommand: options.executorCommand,
    agent: options.agent,
    maxLoops: options.maxLoops ?? 3,
    failOn: options.failOn ?? "required",
    type: task.type ?? "auto",
    base: options.base ?? "main",
    dryRun: options.dryRun
  });
  const changedFiles = sourceChangedFiles(repo, options.base ?? "main");
  const postContext = await buildContextPackage(repo);
  const hallucination = buildHallucinationReport(postContext, { base: options.base ?? "main", traceId: result.report.traceId, task: task.task });
  const regression = buildRegressionReport(postContext, { base: options.base ?? "main", traceId: result.report.traceId, task: task.task, changedFiles });
  const policy = buildPolicyReport(postContext, { base: options.base ?? "main", traceId: result.report.traceId, failOn: options.failOn ?? "required" });
  const finalGate: AgentBenchmarkGate = result.report.decision.blocking ? "blocked" : "strong";
  const metrics = behaviorMetrics({
    policy,
    hallucination,
    exitCode: result.report.executorResult.exitCode,
    finalDecision: result.report.decision.action,
    finalGate
  });
  const trace = readExecutionTrace(repo, result.report.traceId);
  const usage = extractExecutorUsage([result.report.executorResult.stdout, result.report.executorResult.stderr].join("\n"));
  const promptHash = hashText(result.report.iterations.map((iteration) => readTextOrValue(iteration.promptFile)).join("\n--- iteration ---\n"));

  return {
    taskId: task.id,
    fixture: task.fixture,
    task: task.task,
    mode: "loop-enabled-harness",
    executor,
    workdir: repo,
    changedFiles,
    unrelatedChanges: unrelatedChanges(changedFiles, task),
    forbiddenFilesChanged: metrics.forbiddenFilesChanged,
    passedTests: policy.passed && policy.summary.requiredMissing === 0 && result.report.executorResult.exitCode === 0,
    missingEvidence: policy.summary.requiredMissing,
    testsMissing: metrics.testsMissing,
    testsFailed: metrics.testsFailed,
    hallucinatedCommands: metrics.hallucinatedCommands,
    loopCount: result.report.iterations.length,
    iterationsToFinish: result.report.iterations.length,
    finalDecision: result.report.decision.action,
    finalGate,
    finalDecisionAccuracy: metrics.finalDecisionAccuracy,
    humanReviewNeeded: metrics.humanReviewNeeded,
    hallucinationFindings: hallucination.summary.errors + hallucination.summary.warnings,
    regressionFindings: regression.summary.matches,
    exitCode: result.report.executorResult.exitCode,
    commandCount: trace?.steps.filter((step) => Boolean(step.command)).length ?? 0,
    tokenUsage: usage.tokens,
    estimatedCostUsd: usage.costUsd,
    promptHash,
    noProgress: result.report.convergence.status === "repeated-state",
    success: !result.report.decision.blocking && metrics.testsFailed === 0 && metrics.forbiddenFilesChanged === 0 && metrics.hallucinatedCommands === 0
  };
}

async function runDirectMode(
  repo: string,
  task: BenchmarkTaskDefinition,
  mode: Exclude<AgentRunMode, "loop-enabled-harness">,
  executor: AgentExecutorName,
  options: AgentBehaviorBenchmarkOptions
): Promise<AgentBehaviorBenchmarkRun> {
  const runDir = path.join(repo, ".agent-context", "agent-benchmark", task.id, mode);
  mkdirSync(runDir, { recursive: true });
  const prompt = await promptForMode(repo, task, mode);
  const promptFile = path.join(runDir, "prompt.md");
  writeFileSync(promptFile, `${prompt.trim()}\n`, "utf8");
  const trace = startExecutionTrace(repo, task.task, { id: `${task.id}-${mode}`, agent: executor });
  const startedAt = new Date().toISOString();
  const beforeHash = currentWorkingTreeHash(repo);
  const execution = runExecutor(repo, runDir, promptFile, task.task, executor, options);
  const finishedAt = new Date().toISOString();
  const afterHash = currentWorkingTreeHash(repo);
  const normalized = normalizeAgentEvents({
    executor,
    stdout: execution.stdout,
    stderr: execution.stderr,
    repo,
    startedAt,
    finishedAt,
    exitCode: execution.exitCode
  });

  appendExecutionTraceStep(repo, trace.id, {
    agent: executor,
    action: "agent-execute",
    command: execution.command,
    result: execution.exitCode === 0 ? "passed" : "failed",
    finalState: execution.exitCode === 0 ? "partial_success" : "blocked",
    evidenceSource: execution.command ? "command" : "manual",
    capturedBy: execution.command ? "opencode-plusplus" : "external",
    exitCode: execution.exitCode,
    startedAt,
    finishedAt,
    workingTreeHashBefore: beforeHash,
    workingTreeHashAfter: afterHash,
    output: [execution.stdout.trim(), execution.stderr.trim()].filter(Boolean).join("\n")
  });
  for (const event of normalized.events) {
    if (event.type === "test_run" || event.type === "command_run") {
      appendExecutionTraceStep(repo, trace.id, {
        at: event.ts,
        agent: executor,
        action: event.type === "test_run" ? "run-test" : "run-command",
        command: event.command,
        result: event.exitCode === undefined ? "unknown" : event.exitCode === 0 ? "passed" : "failed",
        evidenceSource: "command",
        capturedBy: "external",
        exitCode: event.exitCode,
        startedAt: event.ts,
        finishedAt: event.ts
      });
    }
  }

  const changedFiles = sourceChangedFiles(repo, options.base ?? "main");
  const postContext = await buildContextPackage(repo);
  const hallucination = buildHallucinationReport(postContext, { base: options.base ?? "main", traceId: trace.id, task: task.task });
  const regression = buildRegressionReport(postContext, { base: options.base ?? "main", traceId: trace.id, task: task.task, changedFiles });
  const policy = buildPolicyReport(postContext, { base: options.base ?? "main", traceId: trace.id, failOn: options.failOn ?? "required" });
  const loop = buildLoopControllerReport(postContext, task.task, {
    phase: "after-edit",
    base: options.base ?? "main",
    type: task.type ?? "auto",
    traceId: trace.id
  });
  const finalDecision: AgentBenchmarkFinalDecision = policy.passed ? "weak-pass" : "weak-block";
  const finalGate: AgentBenchmarkGate = policy.passed && loop.status === "ready" ? (mode === "context-pack" ? "medium" : "weak") : "blocked";
  const metrics = behaviorMetrics({
    policy,
    hallucination,
    exitCode: execution.exitCode,
    finalDecision,
    finalGate
  });
  const usage = extractExecutorUsage([execution.stdout, execution.stderr].join("\n"));
  const wrongEdits = unrelatedChanges(changedFiles, task);

  return {
    taskId: task.id,
    fixture: task.fixture,
    task: task.task,
    mode,
    executor,
    workdir: repo,
    changedFiles,
    unrelatedChanges: wrongEdits,
    forbiddenFilesChanged: metrics.forbiddenFilesChanged,
    passedTests: policy.passed && policy.summary.requiredMissing === 0 && execution.exitCode === 0,
    missingEvidence: policy.summary.requiredMissing,
    testsMissing: metrics.testsMissing,
    testsFailed: metrics.testsFailed,
    hallucinatedCommands: metrics.hallucinatedCommands,
    loopCount: 1,
    iterationsToFinish: 1,
    finalDecision,
    finalGate,
    finalDecisionAccuracy: metrics.finalDecisionAccuracy,
    humanReviewNeeded: metrics.humanReviewNeeded,
    hallucinationFindings: hallucination.summary.errors + hallucination.summary.warnings,
    regressionFindings: regression.summary.matches,
    exitCode: execution.exitCode,
    commandCount: normalized.events.filter((event) => event.type === "command_run" || event.type === "test_run").length,
    tokenUsage: usage.tokens,
    estimatedCostUsd: usage.costUsd,
    promptHash: hashText(prompt),
    noProgress: changedFiles.length === 0 && finalGate === "blocked",
    success:
      metrics.testsFailed === 0 &&
      metrics.testsMissing === 0 &&
      metrics.forbiddenFilesChanged === 0 &&
      metrics.hallucinatedCommands === 0 &&
      wrongEdits === 0 &&
      finalGate !== "blocked"
  };
}

async function promptForMode(repo: string, task: BenchmarkTaskDefinition, mode: Exclude<AgentRunMode, "loop-enabled-harness">): Promise<string> {
  if (mode === "no-context") {
    return [`Task: ${task.task}`, "", "Edit the repository to complete the task. Run relevant tests if available."].join("\n");
  }
  if (mode === "agents-md") {
    return [`Task: ${task.task}`, "", "Read AGENTS.md before editing. Keep changes minimal and run relevant tests."].join("\n");
  }

  const context = await buildContextPackage(repo);
  const run = writeTaskRun(context, task.task, { type: task.type ?? "auto", base: "main", preserveTrace: true });
  return [
    `Task: ${task.task}`,
    "",
    `Use the task context pack at ${path.relative(repo, run.dir).replaceAll("\\", "/")}.`,
    "Read plan.md, edit-boundary.md, pack.md, tests.md, impact.md, and prompt.opencode.md before editing.",
    "Keep changes inside the boundary and run required verification."
  ].join("\n");
}

function runExecutor(
  repo: string,
  runDir: string,
  promptFile: string,
  task: string,
  executor: AgentExecutorName,
  options: AgentBehaviorBenchmarkOptions
): { exitCode: number | null; command?: string; stdout: string; stderr: string } {
  if (options.dryRun || executor === "mock") {
    return {
      exitCode: 0,
      stdout: `mock ${executor} benchmark run completed for ${path.basename(runDir)}`,
      stderr: ""
    };
  }
  if (!options.executorCommand) {
    return {
      exitCode: 2,
      stderr: `No executor command configured for ${executor}.`,
      stdout: ""
    };
  }

  const command = expandExecutorCommand(options.executorCommand, {
    promptFile,
    task,
    repo,
    runDir,
    agent: options.agent
  });
  const result = runSafeCommand(command, { cwd: repo, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return {
    exitCode: result.status,
    command,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function prepareBenchmarkMode(value: string): AgentRunMode {
  if (value === "no-context" || value === "agents-md" || value === "context-pack" || value === "loop-enabled-harness") return value;
  throw new Error(`Unsupported benchmark mode: ${value}`);
}

export function parseAgentBenchmarkModes(value: string | undefined): AgentRunMode[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(prepareBenchmarkMode);
}

function initBaseline(repo: string, base: string): void {
  runGit(repo, ["init"]);
  runGit(repo, ["checkout", "-b", base]);
  runGit(repo, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(repo, ["config", "user.name", "OpenCode++ Benchmark"]);
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "benchmark baseline"]);
}

function readTasks(tasksDir: string): BenchmarkTaskDefinition[] {
  return readdirSync(tasksDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .map((fileName) => readJson<BenchmarkTaskDefinition>(path.join(tasksDir, fileName)));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function sourceChangedFiles(repo: string, base: string): string[] {
  const files = new Set<string>();
  try {
    for (const file of changedFilesSince(repo, base)) {
      if (!isGeneratedContext(file)) files.add(file);
    }
  } catch {
    return [];
  }
  return [...files].sort();
}

function unrelatedChanges(changedFiles: string[], task: BenchmarkTaskDefinition): number {
  const allowed = new Set(task.changedFiles);
  return changedFiles.filter((file) => !allowed.has(file) && !isLikelyTestForTask(file, task)).length;
}

function isLikelyTestForTask(filePath: string, task: BenchmarkTaskDefinition): boolean {
  if (!/(^|\/)(test|tests|__tests__)\//i.test(filePath) && !/[.](test|spec)[.][cm]?[jt]sx?$/i.test(filePath) && !/(^|\/)test_.*[.]py$/i.test(filePath))
    return false;
  const taskTerms = new Set(task.changedFiles.flatMap((file) => file.toLowerCase().split(/[/_.-]+/)).filter((term) => term.length >= 4));
  return filePath
    .toLowerCase()
    .split(/[/_.-]+/)
    .some((term) => taskTerms.has(term));
}

function isGeneratedContext(filePath: string): boolean {
  return filePath === "AGENTS.md" || filePath.startsWith(".agent-context/");
}

function summarizeAgentBehavior(runs: AgentBehaviorBenchmarkRun[], modes: AgentRunMode[]): AgentBehaviorModeSummary[] {
  return modes.map((mode) => {
    const modeRuns = runs.filter((run) => run.mode === mode);
    return {
      mode,
      runs: modeRuns.length,
      wrongEdits: average(modeRuns.map((run) => run.unrelatedChanges)),
      forbiddenEdits: average(modeRuns.map((run) => run.forbiddenFilesChanged)),
      staleEvidence: average(modeRuns.map((run) => run.missingEvidence)),
      testsMissing: average(modeRuns.map((run) => run.testsMissing)),
      testsFailed: average(modeRuns.map((run) => run.testsFailed)),
      hallucinatedCommands: average(modeRuns.map((run) => run.hallucinatedCommands)),
      testPassRate: average(modeRuns.map((run) => (run.passedTests ? 1 : 0))),
      loops: average(modeRuns.map((run) => run.iterationsToFinish)),
      finalDecisionAccuracy: average(modeRuns.map((run) => (run.finalDecisionAccuracy ? 1 : 0))),
      humanReviewNeeded: average(modeRuns.map((run) => (run.humanReviewNeeded ? 1 : 0))),
      finalGate: summarizeGate(modeRuns)
    };
  });
}

function behaviorMetrics(input: {
  policy: ReturnType<typeof buildPolicyReport>;
  hallucination: ReturnType<typeof buildHallucinationReport>;
  exitCode: number | null;
  finalDecision: AgentBenchmarkFinalDecision;
  finalGate: AgentBenchmarkGate;
}): Pick<
  AgentBehaviorBenchmarkRun,
  "forbiddenFilesChanged" | "testsMissing" | "testsFailed" | "hallucinatedCommands" | "finalDecisionAccuracy" | "humanReviewNeeded"
> {
  const forbiddenFilesChanged = unique(
    input.policy.findings.filter((finding) => finding.kind === "forbidden" && finding.status === "failed").map((finding) => finding.file ?? finding.id)
  ).length;
  const testsMissing = input.policy.findings.filter(
    (finding) => finding.kind === "required" && finding.status === "missing" && /test|regression/i.test(`${finding.id} ${finding.message}`)
  ).length;
  const testsFailed = input.exitCode !== null && input.exitCode !== 0 ? 1 : 0;
  const hallucinatedCommands = input.hallucination.findings.filter((finding) => finding.kind === "missing_command").length;
  const expectedBlock =
    forbiddenFilesChanged > 0 || testsMissing > 0 || testsFailed > 0 || hallucinatedCommands > 0 || input.policy.summary.requiredMissing > 0;
  const actualBlock =
    input.finalGate === "blocked" ||
    input.finalDecision === "block" ||
    input.finalDecision === "rollback" ||
    input.finalDecision === "human-review" ||
    input.finalDecision === "repair" ||
    input.finalDecision === "repack" ||
    input.finalDecision === "weak-block";

  return {
    forbiddenFilesChanged,
    testsMissing,
    testsFailed,
    hallucinatedCommands,
    finalDecisionAccuracy: expectedBlock ? actualBlock : !actualBlock,
    humanReviewNeeded: input.finalDecision === "human-review" || input.finalDecision === "rollback" || input.finalGate === "blocked"
  };
}

function summarizeGate(runs: AgentBehaviorBenchmarkRun[]): AgentBenchmarkGate {
  if (!runs.length) return "blocked";
  if (runs.some((run) => run.finalGate === "blocked")) return "blocked";
  if (runs.some((run) => run.finalGate === "weak")) return "weak";
  if (runs.some((run) => run.finalGate === "medium")) return "medium";
  return "strong";
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function expandExecutorCommand(
  command: string,
  input: {
    promptFile: string;
    task: string;
    repo: string;
    runDir: string;
    agent?: string;
  }
): string {
  const replacements: Record<string, string> = {
    "{prompt}": shellQuote(input.promptFile),
    "{task}": shellQuote(input.task),
    "{repo}": shellQuote(input.repo),
    "{runDir}": shellQuote(input.runDir),
    "{agent}": shellQuote(input.agent ?? "")
  };
  let expanded = command;
  for (const [token, value] of Object.entries(replacements)) expanded = expanded.replaceAll(token, value);
  return expanded;
}

function finalizeRunTelemetry(run: AgentBehaviorBenchmarkRun, options: AgentBehaviorBenchmarkOptions, elapsedMs: number): AgentBehaviorBenchmarkRun {
  return {
    ...run,
    repetition: options.repetition,
    seed: options.seed,
    elapsedMs,
    commandCount: run.commandCount ?? 0,
    tokenUsage: run.tokenUsage ?? null,
    estimatedCostUsd: run.estimatedCostUsd ?? null,
    promptHash: run.promptHash ?? hashText(`${run.taskId}:${run.mode}:${options.seed ?? 0}`),
    noProgress: run.noProgress ?? false,
    success: run.success ?? (run.passedTests && run.unrelatedChanges === 0 && run.forbiddenFilesChanged === 0 && run.hallucinatedCommands === 0)
  };
}

function extractExecutorUsage(text: string): { tokens: number | null; costUsd: number | null } {
  const tokenValues = [...text.matchAll(/"(?:total_tokens|totalTokens|tokens)"\s*:\s*(\d+)/gi)].map((match) => Number(match[1]));
  const inputValues = [...text.matchAll(/"(?:input_tokens|prompt_tokens)"\s*:\s*(\d+)/gi)].map((match) => Number(match[1]));
  const outputValues = [...text.matchAll(/"(?:output_tokens|completion_tokens)"\s*:\s*(\d+)/gi)].map((match) => Number(match[1]));
  const costValues = [...text.matchAll(/"(?:cost_usd|total_cost_usd|costUSD)"\s*:\s*(\d+(?:\.\d+)?)/gi)].map((match) => Number(match[1]));
  const tokens = tokenValues.length ? Math.max(...tokenValues) : inputValues.length || outputValues.length ? sum(inputValues) + sum(outputValues) : null;
  return { tokens, costUsd: costValues.length ? Math.max(...costValues) : null };
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readTextOrValue(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return filePath;
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function displayMode(mode: AgentRunMode): string {
  const labels: Record<AgentRunMode, string> = {
    "no-context": "A. no context",
    "agents-md": "B. AGENTS.md",
    "context-pack": "C. context pack",
    "loop-enabled-harness": "D. harness-led"
  };
  return labels[mode];
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
