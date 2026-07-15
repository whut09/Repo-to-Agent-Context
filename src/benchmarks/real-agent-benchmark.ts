import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeJsonAtomic, writeTextAtomic } from "../core/atomic-store.js";
import { runGit } from "../core/git.js";
import type { AgentExecutorName } from "../harness/control-plane/orchestrator.js";
import type { PolicyFailOn } from "../harness/verification-plane/policy-engine.js";
import { code, heading, table } from "../outputs/renderers/markdown.js";
import { runAgentBehaviorBenchmark, type AgentBehaviorBenchmarkRun } from "./agent-benchmark.js";
import { runBenchmark, type AgentRunMode } from "./benchmark.js";
import { realExecutorAdapter, type RealExecutorAdapter } from "./executor-adapters.js";
import { summarizeDistribution, type DistributionSummary } from "./statistics.js";

export interface RealAgentBenchmarkOptions {
  benchmarkDir?: string;
  executor: AgentExecutorName;
  executorCommand: string;
  model?: string;
  executorVersion?: string;
  repetitions?: number;
  seeds?: number[];
  maxLoops?: number;
  failOn?: PolicyFailOn;
  base?: string;
  modes?: AgentRunMode[];
  taskIds?: string[];
  keepWorkdirs?: boolean;
  outputDir?: string;
  baselinePath?: string;
  regressionThreshold?: number;
}

export interface RealAgentBenchmarkRun extends AgentBehaviorBenchmarkRun {
  contextRecallAtK: number;
  contextPrecisionAtK: number;
}

export interface RealAgentMetricSummary {
  finalSuccessRate: DistributionSummary;
  wrongFileEditRate: DistributionSummary;
  forbiddenEditRate: DistributionSummary;
  hallucinatedCommandRate: DistributionSummary;
  testPassRate: DistributionSummary;
  repairLoopConvergenceRate: DistributionSummary;
  noProgressRate: DistributionSummary;
  humanReviewRate: DistributionSummary;
  tokenUsage: DistributionSummary;
  estimatedCostUsd: DistributionSummary;
  elapsedMs: DistributionSummary;
  commandCount: DistributionSummary;
  loopCount: DistributionSummary;
  contextRecallAtK: DistributionSummary;
  contextPrecisionAtK: DistributionSummary;
  decisionAccuracy: DistributionSummary;
}

export interface RealAgentBenchmarkResult {
  schemaVersion: "opencode-plusplus.real-agent-benchmark.v1";
  kind: "real-executor";
  generatedAt: string;
  benchmarkDir: string;
  adapter: RealExecutorAdapter;
  executor: { name: AgentExecutorName; model: string; version: string; commandHash: string };
  environment: { repoCommit: string; nodeVersion: string; platform: NodeJS.Platform; arch: string };
  config: {
    repetitions: number;
    seeds: number[];
    maxLoops: number;
    failOn: PolicyFailOn;
    modes: AgentRunMode[];
    taskIds: string[];
    regressionThreshold: number;
  };
  sampleCount: number;
  runs: RealAgentBenchmarkRun[];
  metrics: RealAgentMetricSummary;
  baseline: RealBenchmarkComparison;
  outputFiles: string[];
}

export interface RealBenchmarkComparison {
  status: "not-compared" | "passed" | "regressed";
  baselinePath?: string;
  threshold: number;
  regressions: Array<{ metric: keyof RealAgentMetricSummary; current: number; baseline: number; delta: number }>;
}

export async function runRealAgentBenchmark(options: RealAgentBenchmarkOptions): Promise<RealAgentBenchmarkResult> {
  const adapter = realExecutorAdapter(options.executor);
  if (!options.executorCommand.trim()) throw new Error(`Executor command is required for ${adapter.displayName}.`);
  const benchmarkDir = path.resolve(options.benchmarkDir ?? "benchmarks");
  const repetitions = Math.max(1, options.repetitions ?? 3);
  const seeds = normalizeSeeds(options.seeds, repetitions);
  const deterministic = await runBenchmark({ benchmarkDir });
  const contextMetrics = new Map(deterministic.cases.map((item) => [item.id, item.metrics]));
  const runs: RealAgentBenchmarkRun[] = [];

  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const result = await runAgentBehaviorBenchmark({
      benchmarkDir,
      executor: options.executor,
      executorCommand: options.executorCommand,
      agent: options.model,
      maxLoops: options.maxLoops,
      failOn: options.failOn,
      base: options.base,
      modes: options.modes,
      taskIds: options.taskIds,
      keepWorkdirs: options.keepWorkdirs,
      repetition,
      seed: seeds[repetition - 1]
    });
    for (const run of result.runs) {
      const context = contextMetrics.get(run.taskId);
      runs.push({ ...run, contextRecallAtK: context?.recallAtK ?? 0, contextPrecisionAtK: context?.precisionAtK ?? 0 });
    }
  }

  const threshold = options.regressionThreshold ?? 0.05;
  const result: RealAgentBenchmarkResult = {
    schemaVersion: "opencode-plusplus.real-agent-benchmark.v1",
    kind: "real-executor",
    generatedAt: new Date().toISOString(),
    benchmarkDir,
    adapter,
    executor: {
      name: options.executor,
      model: options.model ?? "unspecified",
      version: options.executorVersion ?? "unknown",
      commandHash: hashText(options.executorCommand)
    },
    environment: {
      repoCommit: safeRepoCommit(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    config: {
      repetitions,
      seeds,
      maxLoops: options.maxLoops ?? 3,
      failOn: options.failOn ?? "required",
      modes: options.modes?.length ? options.modes : ["no-context", "agents-md", "context-pack", "loop-enabled-harness"],
      taskIds: options.taskIds ?? deterministic.cases.map((item) => item.id),
      regressionThreshold: threshold
    },
    sampleCount: runs.length,
    runs,
    metrics: summarizeRealRuns(runs),
    baseline: { status: "not-compared", threshold, regressions: [] },
    outputFiles: []
  };
  result.baseline = compareRealBenchmark(result, options.baselinePath, threshold);
  if (options.outputDir) {
    result.outputFiles = realAgentBenchmarkOutputPaths(result, options.outputDir);
    writeRealAgentBenchmark(result);
  }
  return result;
}

export function summarizeRealRuns(runs: RealAgentBenchmarkRun[]): RealAgentMetricSummary {
  const harnessRuns = runs.filter((run) => run.mode === "loop-enabled-harness");
  return {
    finalSuccessRate: summarizeDistribution(runs.map((run) => (run.success ? 1 : 0))),
    wrongFileEditRate: summarizeDistribution(runs.map((run) => (run.unrelatedChanges > 0 ? 1 : 0))),
    forbiddenEditRate: summarizeDistribution(runs.map((run) => (run.forbiddenFilesChanged > 0 ? 1 : 0))),
    hallucinatedCommandRate: summarizeDistribution(runs.map((run) => (run.hallucinatedCommands > 0 ? 1 : 0))),
    testPassRate: summarizeDistribution(runs.map((run) => (run.passedTests ? 1 : 0))),
    repairLoopConvergenceRate: summarizeDistribution(harnessRuns.map((run) => (run.success && !run.noProgress ? 1 : 0))),
    noProgressRate: summarizeDistribution(harnessRuns.map((run) => (run.noProgress ? 1 : 0))),
    humanReviewRate: summarizeDistribution(runs.map((run) => (run.humanReviewNeeded ? 1 : 0))),
    tokenUsage: summarizeDistribution(runs.map((run) => run.tokenUsage)),
    estimatedCostUsd: summarizeDistribution(runs.map((run) => run.estimatedCostUsd)),
    elapsedMs: summarizeDistribution(runs.map((run) => run.elapsedMs)),
    commandCount: summarizeDistribution(runs.map((run) => run.commandCount)),
    loopCount: summarizeDistribution(runs.map((run) => run.loopCount)),
    contextRecallAtK: summarizeDistribution(runs.map((run) => run.contextRecallAtK)),
    contextPrecisionAtK: summarizeDistribution(runs.map((run) => run.contextPrecisionAtK)),
    decisionAccuracy: summarizeDistribution(runs.map((run) => (run.finalDecisionAccuracy ? 1 : 0)))
  };
}

export function renderRealAgentBenchmark(result: RealAgentBenchmarkResult): string {
  const rows = Object.entries(result.metrics).map(([name, metric]) => [
    name,
    String(metric.samples),
    formatMetric(metric.mean),
    formatMetric(metric.median),
    formatMetric(metric.standardDeviation),
    metric.confidence95 ? `${formatMetric(metric.confidence95.low)} - ${formatMetric(metric.confidence95.high)}` : "n/a"
  ]);
  return [
    heading(1, "Real Executor Benchmark"),
    "",
    `Executor: ${result.adapter.displayName}`,
    `Model/profile: ${result.executor.model}`,
    `Executor version: ${result.executor.version}`,
    `Samples: ${result.sampleCount}`,
    `Repetitions: ${result.config.repetitions}`,
    `Repo commit: ${code(result.environment.repoCommit)}`,
    `Command hash: ${code(result.executor.commandHash)}`,
    "",
    heading(2, "Metrics"),
    table(["Metric", "N", "Mean", "Median", "Std dev", "95% CI"], rows),
    "",
    heading(2, "Baseline Comparison"),
    `Status: ${result.baseline.status}`,
    `Regression threshold: ${result.baseline.threshold}`,
    ...(result.baseline.regressions.length
      ? result.baseline.regressions.map(
          (item) => `- ${item.metric}: ${formatMetric(item.baseline)} -> ${formatMetric(item.current)} (${formatMetric(item.delta)})`
        )
      : ["- No metric regressions detected or no baseline supplied."]),
    "",
    "Real executor metrics are reported separately from deterministic mock proxy metrics."
  ].join("\n");
}

export function compareRealBenchmark(current: RealAgentBenchmarkResult, baselinePath: string | undefined, threshold: number): RealBenchmarkComparison {
  if (!baselinePath || !existsSync(baselinePath)) return { status: "not-compared", baselinePath, threshold, regressions: [] };
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as RealAgentBenchmarkResult;
  const lowerIsBetter = new Set<keyof RealAgentMetricSummary>([
    "wrongFileEditRate",
    "forbiddenEditRate",
    "hallucinatedCommandRate",
    "noProgressRate",
    "humanReviewRate",
    "tokenUsage",
    "estimatedCostUsd",
    "elapsedMs",
    "commandCount",
    "loopCount"
  ]);
  const regressions: RealBenchmarkComparison["regressions"] = [];
  for (const metric of Object.keys(current.metrics) as Array<keyof RealAgentMetricSummary>) {
    const currentMean = current.metrics[metric].mean;
    const baselineMean = baseline.metrics?.[metric]?.mean;
    if (currentMean === null || baselineMean === null || baselineMean === undefined) continue;
    const delta = currentMean - baselineMean;
    if ((lowerIsBetter.has(metric) && delta > threshold) || (!lowerIsBetter.has(metric) && delta < -threshold)) {
      regressions.push({ metric, current: currentMean, baseline: baselineMean, delta });
    }
  }
  return { status: regressions.length ? "regressed" : "passed", baselinePath, threshold, regressions };
}

function realAgentBenchmarkOutputPaths(result: RealAgentBenchmarkResult, outputDir: string): string[] {
  const absolute = path.resolve(outputDir);
  const stamp = result.generatedAt.replace(/[:.]/g, "-");
  return [
    path.join(absolute, "real-agent-benchmark.json"),
    path.join(absolute, `real-agent-benchmark-${stamp}.json`),
    path.join(absolute, "real-agent-benchmark.md")
  ];
}

function writeRealAgentBenchmark(result: RealAgentBenchmarkResult): void {
  const [jsonLatest, jsonHistory, markdownLatest] = result.outputFiles;
  if (!jsonLatest || !jsonHistory || !markdownLatest) return;
  mkdirSync(path.dirname(jsonLatest), { recursive: true });
  const markdown = renderRealAgentBenchmark(result);
  writeJsonAtomic(jsonLatest, result);
  writeJsonAtomic(jsonHistory, result);
  writeTextAtomic(markdownLatest, `${markdown}\n`);
}

function normalizeSeeds(seeds: number[] | undefined, repetitions: number): number[] {
  const source = seeds?.length ? seeds : Array.from({ length: repetitions }, (_, index) => index + 1);
  return Array.from({ length: repetitions }, (_, index) => source[index % source.length] ?? index + 1);
}

function safeRepoCommit(): string {
  try {
    return runGit(process.cwd(), ["rev-parse", "HEAD"]).trim();
  } catch {
    return "unknown";
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : Number.isInteger(value) ? String(value) : value.toFixed(4);
}
