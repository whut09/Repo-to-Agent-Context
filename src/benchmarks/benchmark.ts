import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TaskType } from "../core/types.js";
import { buildContextPackage } from "../core/context-builder.js";
import { buildTaskPack } from "../outputs/task-context.js";
import { buildTestSelection } from "../outputs/test-selector.js";
import { code, heading, table } from "../outputs/renderers/markdown.js";

export interface BenchmarkTaskDefinition {
  id: string;
  fixture: string;
  task: string;
  type?: TaskType;
  changedFiles: string[];
  topK?: number;
  tokenBudget?: number;
}

export interface BenchmarkOptions {
  benchmarkDir?: string;
  topK?: number;
}

export type BenchmarkCategory = "context-recall" | "boundary" | "evidence" | "regression";

export type AgentRunMode = "no-context" | "agents-md" | "context-pack" | "loop-enabled-harness";

type LegacyAgentRunMode = AgentRunMode | "task-pack" | "task-pack-contracts-verify";

const AGENT_RUN_MODES: AgentRunMode[] = ["no-context", "agents-md", "context-pack", "loop-enabled-harness"];

const LEGACY_MODE_ALIASES: Record<LegacyAgentRunMode, AgentRunMode> = {
  "no-context": "no-context",
  "agents-md": "agents-md",
  "context-pack": "context-pack",
  "loop-enabled-harness": "loop-enabled-harness",
  "task-pack": "context-pack",
  "task-pack-contracts-verify": "loop-enabled-harness"
};

export interface AgentRunRecord {
  task: string;
  agent: string;
  mode: AgentRunMode;
  changedFiles: string[];
  passedTests: boolean;
  unrelatedChanges: number;
  forbiddenFilesChanged?: number;
  testsMissing?: number;
  testsFailed?: number;
  hallucinatedCommands?: number;
  iterationsToFinish?: number;
  finalDecisionAccuracy?: boolean;
  humanReviewNeeded?: boolean;
  score: number;
  foundCorrectFiles?: boolean;
  modifiedCorrectLocation?: boolean;
  tokenUsage?: number;
  iterations?: number;
  repairLoops?: number;
  notes?: string;
}

export interface AgentRunModeSummary {
  mode: AgentRunMode;
  runs: number;
  averageScore: number;
  passRate: number;
  averageUnrelatedChanges: number;
  averageWrongFileEdits: number;
  testFailureRate: number;
  averageTokenUsage: number | null;
  averageIterations: number | null;
  averageSteps: number | null;
  averageRepairLoops: number | null;
}

export interface LoopBehaviorDelta {
  wrongFileEditsReduction: number | null;
  testFailureReduction: number | null;
  stepsReduction: number | null;
  tokenUsageReduction: number | null;
  repairLoopsReduction: number | null;
  moatScore: number | null;
}

export interface BenchmarkCaseResult {
  id: string;
  fixture: string;
  task: string;
  topK: number;
  expectedRelevantFiles: string[];
  expectedRequiredTests: string[];
  selectedFiles: string[];
  selectedTopK: string[];
  baselineTopK: string[];
  recommendedTests: string[];
  category: BenchmarkCategory;
  agentRuns: AgentRunRecord[];
  agentRunModes: AgentRunModeSummary[];
  metrics: {
    recallAtK: number;
    precisionAtK: number;
    baselineRecallAtK: number;
    tokenCompressionRatio: number;
    testRecommendationAccuracy: number;
    contextPackSuccessProxy: number;
    baselineSuccessProxy: number;
    agentSuccessDeltaProxy: number;
    agentSuccessDelta: number | null;
    loopBehaviorDelta: LoopBehaviorDelta;
  };
}

export interface BenchmarkRunResult {
  benchmarkDir: string;
  topK: number;
  elapsedMs: number;
  cases: BenchmarkCaseResult[];
  summary: BenchmarkSummary;
  categories: BenchmarkCategorySummary[];
}

export interface BenchmarkCategorySummary {
  category: BenchmarkCategory;
  cases: number;
  averageRecallAtK: number;
  boundaryViolationBlockRate: number | null;
  hallucinationDetectionRate: number | null;
  falsePositiveRate: number | null;
  repairLoopConvergenceRate: number | null;
}

export interface BenchmarkSummary {
  cases: number;
  sampleCount: number;
  elapsedMs: number;
  averageRecallAtK: number;
  averagePrecisionAtK: number;
  averageBaselineRecallAtK: number;
  averageTokenCompressionRatio: number;
  averageTestRecommendationAccuracy: number;
  averageAgentSuccessDeltaProxy: number;
  averageAgentSuccessDelta: number | null;
  averageWrongFileEditReduction: number | null;
  averageTestFailureReduction: number | null;
  averageStepsReduction: number | null;
  averageTokenUsageReduction: number | null;
  averageRepairLoopReduction: number | null;
  averageLoopMoatScore: number | null;
  agentRunCases: number;
  contextRecallAt8: number;
  boundaryViolationBlockRate: number | null;
  hallucinationDetectionRate: number | null;
  falsePositiveRate: number | null;
  repairLoopConvergenceRate: number | null;
}

export async function runBenchmark(options: BenchmarkOptions = {}): Promise<BenchmarkRunResult> {
  const startedAt = Date.now();
  const benchmarkDir = path.resolve(options.benchmarkDir ?? "benchmarks");
  const topK = options.topK ?? 8;
  const tasks = readTasks(path.join(benchmarkDir, "tasks"));
  const relevantFiles = readJson<Record<string, string[]>>(path.join(benchmarkDir, "expected", "relevant-files.json"));
  const requiredTests = readJson<Record<string, string[]>>(path.join(benchmarkDir, "expected", "required-tests.json"));
  const agentRuns = readAgentRuns(path.join(benchmarkDir, "agent-runs"));
  const cases: BenchmarkCaseResult[] = [];

  for (const task of tasks) {
    const fixtureRoot = path.join(benchmarkDir, "fixtures", task.fixture);
    const context = await buildContextPackage(fixtureRoot, { cache: false });
    const caseTopK = task.topK ?? topK;
    const pack = buildTaskPack(context, task.task, { type: task.type ?? "auto", tokenBudget: task.tokenBudget });
    const selectedFiles = pack.files.map((file) => file.path);
    const selectedTopK = selectedFiles.slice(0, caseTopK);
    const expectedRelevantFiles = relevantFiles[task.id] ?? [];
    const expectedRequiredTests = requiredTests[task.id] ?? [];
    const testSelection = buildTestSelection(context, { forPaths: task.changedFiles });
    const recommendedTests = unique([...testSelection.minimalTests, ...testSelection.recommendedRegressionTests]);
    const baselineTopK = context.keyFiles.slice(0, caseTopK).map((file) => file.path);
    const recallAtK = recall(expectedRelevantFiles, selectedTopK);
    const precisionAtK = precision(expectedRelevantFiles, selectedTopK, caseTopK);
    const baselineRecallAtK = recall(expectedRelevantFiles, baselineTopK);
    const testRecommendationAccuracy = recall(expectedRequiredTests, recommendedTests);
    const baselineTestAccuracy = recall(expectedRequiredTests, baselineTopK);
    const contextPackSuccessProxy = recallAtK === 1 && testRecommendationAccuracy === 1 ? 1 : 0;
    const baselineSuccessProxy = baselineRecallAtK === 1 && baselineTestAccuracy === 1 ? 1 : 0;
    const tokenCompressionRatio = ratio(context.tokenSavings.originalRepoTokens.tokens, pack.estimatedTokens);
    const category = benchmarkCategoryForTask(task);
    const caseAgentRuns = agentRuns.filter((run) => run.task === task.id || run.task === task.task);
    const agentRunModes = summarizeAgentRuns(caseAgentRuns);
    const agentSuccessDelta = realAgentSuccessDelta(agentRunModes);
    const loopBehaviorDelta = calculateLoopBehaviorDelta(agentRunModes);

    cases.push({
      id: task.id,
      fixture: task.fixture,
      task: task.task,
      topK: caseTopK,
      expectedRelevantFiles,
      expectedRequiredTests,
      category,
      selectedFiles,
      selectedTopK,
      baselineTopK,
      recommendedTests,
      agentRuns: caseAgentRuns,
      agentRunModes,
      metrics: {
        recallAtK,
        precisionAtK,
        baselineRecallAtK,
        tokenCompressionRatio,
        testRecommendationAccuracy,
        contextPackSuccessProxy,
        baselineSuccessProxy,
        agentSuccessDeltaProxy: contextPackSuccessProxy - baselineSuccessProxy,
        agentSuccessDelta,
        loopBehaviorDelta
      }
    });
  }

  const elapsedMs = Date.now() - startedAt;
  return {
    benchmarkDir,
    topK,
    elapsedMs,
    cases,
    summary: { ...summarize(cases), elapsedMs },
    categories: summarizeCategories(cases)
  };
}

export function renderBenchmarkReport(result: BenchmarkRunResult): string {
  return [
    heading(1, "Harness Benchmark"),
    "",
    `Benchmark dir: ${code(result.benchmarkDir)}`,
    `Cases: ${result.summary.cases}`,
    `Samples: ${result.summary.sampleCount}`,
    `Elapsed: ${result.summary.elapsedMs} ms`,
    `Cases with agent runs: ${result.summary.agentRunCases}`,
    `Default K: ${result.topK}`,
    "",
    heading(2, "Summary"),
    table(
      ["Metric", "Value"],
      [
        ["context_recall@8", percent(result.summary.contextRecallAt8)],
        ["boundary_violation_block_rate", formatNullablePercent(result.summary.boundaryViolationBlockRate)],
        ["hallucination_detection_rate", formatNullablePercent(result.summary.hallucinationDetectionRate)],
        ["false_positive_rate", formatNullablePercent(result.summary.falsePositiveRate)],
        ["repair_loop_convergence_rate", formatNullablePercent(result.summary.repairLoopConvergenceRate)],
        ["Wrong file edits reduction", formatNullableNumber(result.summary.averageWrongFileEditReduction)],
        ["Test failure reduction", formatNullableNumber(result.summary.averageTestFailureReduction)],
        ["Steps per task reduction", formatNullableNumber(result.summary.averageStepsReduction)],
        ["Token usage reduction", formatNullableNumber(result.summary.averageTokenUsageReduction)],
        ["Repair loops reduction", formatNullableNumber(result.summary.averageRepairLoopReduction)],
        ["Loop moat score", result.summary.averageLoopMoatScore === null ? "No agent-run records" : percent(result.summary.averageLoopMoatScore)],
        ["Recall@K", percent(result.summary.averageRecallAtK)],
        ["Precision@K", percent(result.summary.averagePrecisionAtK)],
        ["Baseline Recall@K", percent(result.summary.averageBaselineRecallAtK)],
        ["Token compression ratio", `${result.summary.averageTokenCompressionRatio.toFixed(1)}x`],
        ["Test recommendation accuracy", percent(result.summary.averageTestRecommendationAccuracy)],
        ["Agent success delta", result.summary.averageAgentSuccessDelta === null ? "No agent-run records" : signed(result.summary.averageAgentSuccessDelta)],
        ["Agent success delta proxy", signed(result.summary.averageAgentSuccessDeltaProxy)]
      ]
    ),
    "",
    heading(2, "Benchmark Categories"),
    renderBenchmarkCategories(result),
    "",
    heading(2, "Loop Harness Delta"),
    renderLoopHarnessDelta(result),
    "",
    heading(2, "Context Quality Signals"),
    table(
      ["Task", "Category", "Fixture", "Recall@K", "Precision@K", "Tests", "Compression", "Agent Delta", "Delta Proxy"],
      result.cases.map((item) => [
        item.id,
        item.category,
        item.fixture,
        percent(item.metrics.recallAtK),
        percent(item.metrics.precisionAtK),
        percent(item.metrics.testRecommendationAccuracy),
        `${item.metrics.tokenCompressionRatio.toFixed(1)}x`,
        item.metrics.agentSuccessDelta === null ? "n/a" : signed(item.metrics.agentSuccessDelta),
        signed(item.metrics.agentSuccessDeltaProxy)
      ])
    ),
    "",
    heading(2, "Behavior Comparison"),
    renderAgentRunModes(result),
    "",
    heading(2, "Interpretation"),
    "- The benchmark is split into Context Recall, Boundary, Evidence, and Regression categories.",
    "- Behavior comparison is the primary loop benchmark: it compares A no context, B AGENTS.md only, C context pack, and D loop enabled harness.",
    "- Wrong file edits: unrelated file edits recorded by the run evaluator. Lower is better.",
    "- Test failure reduction: failed-test rate improvement from `no-context` to `loop-enabled-harness`. Higher is better.",
    "- Steps per task: agent iterations or turns needed to finish the task. Lower is better.",
    "- Repair loops: explicit retry, repair, or re-plan cycles observed during a run. Lower is better.",
    "- Loop moat score: average normalized reduction across wrong file edits, test failures, steps, token usage, and repair loops.",
    "- Recall@K: expected task-relevant files present in the task pack top K.",
    "- Precision@K: top K slots that are expected task-relevant files.",
    "- Baseline Recall@K: same recall using non-task-aware key files as the baseline.",
    "- Token compression ratio: original fixture token estimate divided by selected task-pack token estimate.",
    "- Test recommendation accuracy: expected tests present in minimal or regression recommendations.",
    "- Agent success delta: average score improvement from `no-context` to `loop-enabled-harness` when `benchmarks/agent-runs/*.json` records are present.",
    "- Agent success delta proxy: deterministic fallback comparing task-pack coverage with baseline coverage when no agent-run records exist."
  ].join("\n");
}

function renderBenchmarkCategories(result: BenchmarkRunResult): string {
  return table(
    ["Category", "Cases", "Recall@K", "Boundary block", "Hallucination detection", "False positive", "Repair convergence"],
    result.categories.map((item) => [
      displayBenchmarkCategory(item.category),
      String(item.cases),
      percent(item.averageRecallAtK),
      formatNullablePercent(item.boundaryViolationBlockRate),
      formatNullablePercent(item.hallucinationDetectionRate),
      formatNullablePercent(item.falsePositiveRate),
      formatNullablePercent(item.repairLoopConvergenceRate)
    ])
  );
}

function renderLoopHarnessDelta(result: BenchmarkRunResult): string {
  const rows = result.cases
    .filter((item) => item.agentRunModes.length > 0)
    .map((item) => {
      const delta = item.metrics.loopBehaviorDelta;
      return [
        item.id,
        formatNullableNumber(delta.wrongFileEditsReduction),
        formatNullableNumber(delta.testFailureReduction),
        formatNullableNumber(delta.stepsReduction),
        formatNullableNumber(delta.tokenUsageReduction),
        formatNullableNumber(delta.repairLoopsReduction),
        delta.moatScore === null ? "n/a" : percent(delta.moatScore)
      ];
    });

  if (!rows.length) {
    return "No `benchmarks/agent-runs/*.json` records found.";
  }

  return table(["Task", "Wrong edits reduction", "Test failures reduction", "Steps reduction", "Tokens reduction", "Repair loops reduction", "Moat"], rows);
}

function renderAgentRunModes(result: BenchmarkRunResult): string {
  const rows = result.cases.flatMap((item) =>
    item.agentRunModes.map((mode) => [
      item.id,
      displayAgentRunMode(mode.mode),
      mode.runs.toString(),
      signed(mode.averageScore),
      mode.averageWrongFileEdits.toFixed(1),
      mode.testFailureRate.toFixed(2),
      mode.averageSteps === null ? "n/a" : mode.averageSteps.toFixed(1),
      mode.averageTokenUsage === null ? "n/a" : Math.round(mode.averageTokenUsage).toLocaleString(),
      mode.averageRepairLoops === null ? "n/a" : mode.averageRepairLoops.toFixed(1)
    ])
  );

  if (!rows.length) {
    return "No `benchmarks/agent-runs/*.json` records found.";
  }

  const detailedRows = result.cases.flatMap((item) =>
    item.agentRuns.map((run) => [
      item.id,
      displayAgentRunMode(run.mode),
      String(run.unrelatedChanges),
      String(run.forbiddenFilesChanged ?? 0),
      String(run.testsMissing ?? 0),
      String(run.testsFailed ?? (run.passedTests ? 0 : 1)),
      String(run.hallucinatedCommands ?? 0),
      String(run.iterationsToFinish ?? run.iterations ?? "n/a"),
      inferredDecisionAccuracy(run) ? "yes" : "no",
      inferredHumanReviewNeeded(run) ? "yes" : "no"
    ])
  );

  return [
    table(["Task", "Mode", "Runs", "Score", "Wrong file edits", "Test failures", "Steps", "Tokens", "Repair loops"], rows),
    "",
    heading(3, "Phase 6 Metrics"),
    table(
      ["Task", "Mode", "Wrong files", "Forbidden", "Tests missing", "Tests failed", "Hallucinated commands", "Iterations", "Decision accurate", "Human review"],
      detailedRows
    )
  ].join("\n");
}

function readTasks(tasksDir: string): BenchmarkTaskDefinition[] {
  return readdirSync(tasksDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .map((fileName) => readJson<BenchmarkTaskDefinition>(path.join(tasksDir, fileName)));
}

function readAgentRuns(agentRunsDir: string): AgentRunRecord[] {
  if (!existsSync(agentRunsDir)) return [];
  return readdirSync(agentRunsDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .flatMap((fileName) => {
      const parsed = readJson<unknown | unknown[]>(path.join(agentRunsDir, fileName));
      return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeAgentRunRecord).filter((record): record is AgentRunRecord => record !== null);
    });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function recall(expected: string[], actual: string[]): number {
  if (!expected.length) return 1;
  const actualSet = new Set(actual);
  return expected.filter((item) => actualSet.has(item)).length / expected.length;
}

function precision(expected: string[], actual: string[], k: number): number {
  if (k <= 0) return 0;
  const expectedSet = new Set(expected);
  return actual.slice(0, k).filter((item) => expectedSet.has(item)).length / k;
}

function ratio(numerator: number, denominator: number): number {
  return numerator / Math.max(1, denominator);
}

function summarize(cases: BenchmarkCaseResult[]): BenchmarkSummary {
  const realDeltas = cases.map((item) => item.metrics.agentSuccessDelta).filter((value): value is number => typeof value === "number");
  const loopDeltas = cases.map((item) => item.metrics.loopBehaviorDelta);
  const categorySummaries = summarizeCategories(cases);
  return {
    cases: cases.length,
    sampleCount: cases.length,
    elapsedMs: 0,
    averageRecallAtK: average(cases.map((item) => item.metrics.recallAtK)),
    averagePrecisionAtK: average(cases.map((item) => item.metrics.precisionAtK)),
    averageBaselineRecallAtK: average(cases.map((item) => item.metrics.baselineRecallAtK)),
    averageTokenCompressionRatio: average(cases.map((item) => item.metrics.tokenCompressionRatio)),
    averageTestRecommendationAccuracy: average(cases.map((item) => item.metrics.testRecommendationAccuracy)),
    averageAgentSuccessDeltaProxy: average(cases.map((item) => item.metrics.agentSuccessDeltaProxy)),
    averageAgentSuccessDelta: realDeltas.length ? average(realDeltas) : null,
    averageWrongFileEditReduction: nullableAverage(loopDeltas.map((delta) => delta.wrongFileEditsReduction).filter(isNumber)),
    averageTestFailureReduction: nullableAverage(loopDeltas.map((delta) => delta.testFailureReduction).filter(isNumber)),
    averageStepsReduction: nullableAverage(loopDeltas.map((delta) => delta.stepsReduction).filter(isNumber)),
    averageTokenUsageReduction: nullableAverage(loopDeltas.map((delta) => delta.tokenUsageReduction).filter(isNumber)),
    averageRepairLoopReduction: nullableAverage(loopDeltas.map((delta) => delta.repairLoopsReduction).filter(isNumber)),
    averageLoopMoatScore: nullableAverage(loopDeltas.map((delta) => delta.moatScore).filter(isNumber)),
    agentRunCases: cases.filter((item) => item.agentRuns.length > 0).length,
    contextRecallAt8: average(cases.map((item) => recall(item.expectedRelevantFiles, item.selectedFiles.slice(0, 8)))),
    boundaryViolationBlockRate: metricFromCategories(categorySummaries, "boundary", "boundaryViolationBlockRate"),
    hallucinationDetectionRate: metricFromCategories(categorySummaries, "evidence", "hallucinationDetectionRate"),
    falsePositiveRate: nullableAverage(categorySummaries.map((item) => item.falsePositiveRate).filter(isNumber)),
    repairLoopConvergenceRate: nullableAverage(categorySummaries.map((item) => item.repairLoopConvergenceRate).filter(isNumber))
  };
}

function summarizeCategories(cases: BenchmarkCaseResult[]): BenchmarkCategorySummary[] {
  const categories: BenchmarkCategory[] = ["context-recall", "boundary", "evidence", "regression"];
  return categories.map((category) => {
    const categoryCases = cases.filter((item) => item.category === category);
    return {
      category,
      cases: categoryCases.length,
      averageRecallAtK: average(categoryCases.map((item) => item.metrics.recallAtK)),
      boundaryViolationBlockRate: category === "boundary" ? rate(categoryCases.map(boundaryBlocked)) : null,
      hallucinationDetectionRate: category === "evidence" ? rate(categoryCases.map(hallucinationDetected)) : null,
      falsePositiveRate: rate(categoryCases.flatMap(falsePositiveSignals)),
      repairLoopConvergenceRate: rate(categoryCases.map(repairLoopConverged))
    };
  });
}

function metricFromCategories<K extends keyof BenchmarkCategorySummary>(
  summaries: BenchmarkCategorySummary[],
  category: BenchmarkCategory,
  field: K
): BenchmarkCategorySummary[K] | null {
  return summaries.find((item) => item.category === category)?.[field] ?? null;
}

function benchmarkCategoryForTask(task: BenchmarkTaskDefinition): BenchmarkCategory {
  if (/protected|forbidden|lockfile/i.test(task.id)) return "boundary";
  if (/hallucinat|evidence|command/i.test(task.id)) return "evidence";
  if (/regression|ttl/i.test(task.id)) return "regression";
  return "context-recall";
}

function boundaryBlocked(item: BenchmarkCaseResult): boolean {
  return item.agentRuns.some(
    (run) =>
      run.mode === "loop-enabled-harness" && (run.finalDecisionAccuracy === true || run.humanReviewNeeded === true) && (run.forbiddenFilesChanged ?? 0) === 0
  );
}

function hallucinationDetected(item: BenchmarkCaseResult): boolean {
  const baselineHadHallucination = item.agentRuns.some((run) => run.mode !== "loop-enabled-harness" && (run.hallucinatedCommands ?? 0) > 0);
  const harnessBlockedOrCleaned = item.agentRuns.some(
    (run) => run.mode === "loop-enabled-harness" && (run.hallucinatedCommands ?? 0) === 0 && run.finalDecisionAccuracy === true
  );
  return baselineHadHallucination && harnessBlockedOrCleaned;
}

function falsePositiveSignals(item: BenchmarkCaseResult): boolean[] {
  const cleanHarnessRuns = item.agentRuns.filter(
    (run) =>
      run.mode === "loop-enabled-harness" &&
      run.passedTests &&
      run.unrelatedChanges === 0 &&
      (run.forbiddenFilesChanged ?? 0) === 0 &&
      (run.hallucinatedCommands ?? 0) === 0 &&
      (run.testsMissing ?? 0) === 0 &&
      (run.testsFailed ?? 0) === 0
  );
  return cleanHarnessRuns.map((run) => run.humanReviewNeeded === true || run.finalDecisionAccuracy === false);
}

function repairLoopConverged(item: BenchmarkCaseResult): boolean {
  const baseline = item.agentRuns.find((run) => run.mode === "no-context");
  const harness = item.agentRuns.find((run) => run.mode === "loop-enabled-harness");
  if (!harness) return false;
  const harnessLoops = harness.repairLoops ?? harness.iterationsToFinish ?? harness.iterations ?? 0;
  const baselineLoops = baseline?.repairLoops ?? baseline?.iterationsToFinish ?? baseline?.iterations ?? harnessLoops;
  return harness.passedTests && (harness.finalDecisionAccuracy ?? true) && harnessLoops <= baselineLoops;
}

function rate(values: boolean[]): number | null {
  return values.length ? average(values.map((value) => (value ? 1 : 0))) : null;
}

function summarizeAgentRuns(runs: AgentRunRecord[]): AgentRunModeSummary[] {
  return AGENT_RUN_MODES.map((mode) => {
    const modeRuns = runs.filter((run) => run.mode === mode);
    const averageIterations = nullableAverage(modeRuns.map((run) => run.iterations).filter(isNumber));
    return {
      mode,
      runs: modeRuns.length,
      averageScore: average(modeRuns.map((run) => run.score)),
      passRate: average(modeRuns.map((run) => (run.passedTests ? 1 : 0))),
      averageUnrelatedChanges: average(modeRuns.map((run) => run.unrelatedChanges)),
      averageWrongFileEdits: average(modeRuns.map((run) => run.unrelatedChanges)),
      testFailureRate: average(modeRuns.map((run) => (run.passedTests ? 0 : 1))),
      averageTokenUsage: nullableAverage(modeRuns.map((run) => run.tokenUsage).filter(isNumber)),
      averageIterations,
      averageSteps: averageIterations,
      averageRepairLoops: nullableAverage(modeRuns.map((run) => run.repairLoops).filter(isNumber))
    };
  }).filter((summary) => summary.runs > 0);
}

function realAgentSuccessDelta(modes: AgentRunModeSummary[]): number | null {
  const baseline = modes.find((mode) => mode.mode === "no-context");
  const harness =
    modes.find((mode) => mode.mode === "loop-enabled-harness") ??
    modes.find((mode) => mode.mode === "context-pack") ??
    modes.find((mode) => mode.mode === "agents-md");
  if (!baseline || !harness) return null;
  return harness.averageScore - baseline.averageScore;
}

function calculateLoopBehaviorDelta(modes: AgentRunModeSummary[]): LoopBehaviorDelta {
  const baseline = modes.find((mode) => mode.mode === "no-context");
  const harness = modes.find((mode) => mode.mode === "loop-enabled-harness");
  if (!baseline || !harness) {
    return {
      wrongFileEditsReduction: null,
      testFailureReduction: null,
      stepsReduction: null,
      tokenUsageReduction: null,
      repairLoopsReduction: null,
      moatScore: null
    };
  }

  const wrongFileEditsReduction = baseline.averageWrongFileEdits - harness.averageWrongFileEdits;
  const testFailureReduction = baseline.testFailureRate - harness.testFailureRate;
  const stepsReduction = nullableDifference(baseline.averageSteps, harness.averageSteps);
  const tokenUsageReduction = nullableDifference(baseline.averageTokenUsage, harness.averageTokenUsage);
  const repairLoopsReduction = nullableDifference(baseline.averageRepairLoops, harness.averageRepairLoops);
  const moatScore = nullableAverage(
    [
      normalizedReduction(baseline.averageWrongFileEdits, harness.averageWrongFileEdits),
      normalizedReduction(baseline.testFailureRate, harness.testFailureRate),
      normalizedReduction(baseline.averageSteps, harness.averageSteps),
      normalizedReduction(baseline.averageTokenUsage, harness.averageTokenUsage),
      normalizedReduction(baseline.averageRepairLoops, harness.averageRepairLoops)
    ].filter(isNumber)
  );

  return {
    wrongFileEditsReduction,
    testFailureReduction,
    stepsReduction,
    tokenUsageReduction,
    repairLoopsReduction,
    moatScore
  };
}

function nullableDifference(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return left - right;
}

function normalizedReduction(left: number | null, right: number | null): number | null {
  if (left === null || right === null || left <= 0) return null;
  return Math.max(0, Math.min(1, (left - right) / left));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nullableAverage(values: number[]): number | null {
  return values.length ? average(values) : null;
}

function normalizeAgentRunRecord(value: unknown): AgentRunRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AgentRunRecord> & { mode?: LegacyAgentRunMode };
  if (
    typeof candidate.task !== "string" ||
    typeof candidate.agent !== "string" ||
    !candidate.mode ||
    !isKnownAgentRunMode(candidate.mode) ||
    !Array.isArray(candidate.changedFiles) ||
    typeof candidate.passedTests !== "boolean" ||
    typeof candidate.unrelatedChanges !== "number" ||
    typeof candidate.score !== "number"
  ) {
    return null;
  }

  return {
    task: candidate.task,
    agent: candidate.agent,
    mode: LEGACY_MODE_ALIASES[candidate.mode],
    changedFiles: candidate.changedFiles,
    passedTests: candidate.passedTests,
    unrelatedChanges: candidate.unrelatedChanges,
    forbiddenFilesChanged: candidate.forbiddenFilesChanged,
    testsMissing: candidate.testsMissing,
    testsFailed: candidate.testsFailed,
    hallucinatedCommands: candidate.hallucinatedCommands,
    iterationsToFinish: candidate.iterationsToFinish,
    finalDecisionAccuracy: candidate.finalDecisionAccuracy,
    humanReviewNeeded: candidate.humanReviewNeeded,
    score: candidate.score,
    foundCorrectFiles: candidate.foundCorrectFiles,
    modifiedCorrectLocation: candidate.modifiedCorrectLocation,
    tokenUsage: candidate.tokenUsage,
    iterations: candidate.iterations,
    repairLoops: candidate.repairLoops,
    notes: candidate.notes
  };
}

function isKnownAgentRunMode(value: string): value is LegacyAgentRunMode {
  return value in LEGACY_MODE_ALIASES;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number";
}

function inferredDecisionAccuracy(run: AgentRunRecord): boolean {
  if (run.finalDecisionAccuracy !== undefined) return run.finalDecisionAccuracy;
  return run.mode === "loop-enabled-harness" || (run.passedTests && run.unrelatedChanges === 0);
}

function inferredHumanReviewNeeded(run: AgentRunRecord): boolean {
  if (run.humanReviewNeeded !== undefined) return run.humanReviewNeeded;
  return !run.passedTests || run.unrelatedChanges > 0 || (run.forbiddenFilesChanged ?? 0) > 0 || (run.hallucinatedCommands ?? 0) > 0;
}

function displayBenchmarkCategory(category: BenchmarkCategory): string {
  const labels: Record<BenchmarkCategory, string> = {
    "context-recall": "Context Recall Benchmark",
    boundary: "Boundary Benchmark",
    evidence: "Evidence Benchmark",
    regression: "Regression Benchmark"
  };
  return labels[category];
}

function displayAgentRunMode(mode: AgentRunMode): string {
  const labels: Record<AgentRunMode, string> = {
    "no-context": "A. no context",
    "agents-md": "B. AGENTS.md only",
    "context-pack": "C. context pack",
    "loop-enabled-harness": "D. loop enabled harness"
  };
  return labels[mode];
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number): string {
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "n/a" : percent(value);
}

function formatNullableNumber(value: number | null): string {
  if (value === null) return "n/a";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  return value.toFixed(2);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
