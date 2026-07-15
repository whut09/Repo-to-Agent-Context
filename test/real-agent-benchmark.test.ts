import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { realExecutorAdapter } from "../src/benchmarks/executor-adapters.js";
import {
  compareRealBenchmark,
  renderRealAgentBenchmark,
  summarizeRealRuns,
  type RealAgentBenchmarkResult,
  type RealAgentBenchmarkRun
} from "../src/benchmarks/real-agent-benchmark.js";
import { summarizeDistribution } from "../src/benchmarks/statistics.js";

test("distribution summaries report sample statistics and confidence intervals", () => {
  const summary = summarizeDistribution([1, 2, 3, null, undefined]);
  assert.equal(summary.samples, 3);
  assert.equal(summary.mean, 2);
  assert.equal(summary.median, 2);
  assert.equal(summary.standardDeviation, 1);
  assert.ok(summary.confidence95);
  assert.ok((summary.confidence95?.low ?? 0) < 2);
  assert.ok((summary.confidence95?.high ?? 0) > 2);
});

test("real benchmark summaries keep convergence and executor telemetry separate", () => {
  const metrics = summarizeRealRuns([
    benchmarkRun({ mode: "loop-enabled-harness", success: true, noProgress: false, tokenUsage: 100, elapsedMs: 10 }),
    benchmarkRun({ mode: "loop-enabled-harness", success: false, noProgress: true, tokenUsage: 300, elapsedMs: 30 }),
    benchmarkRun({ mode: "context-pack", success: true, noProgress: false, tokenUsage: 200, elapsedMs: 20 })
  ]);

  assert.equal(metrics.finalSuccessRate.samples, 3);
  assert.equal(metrics.finalSuccessRate.mean, 2 / 3);
  assert.equal(metrics.repairLoopConvergenceRate.samples, 2);
  assert.equal(metrics.repairLoopConvergenceRate.mean, 0.5);
  assert.equal(metrics.noProgressRate.mean, 0.5);
  assert.equal(metrics.tokenUsage.mean, 200);
  assert.equal(metrics.elapsedMs.median, 20);
});

test("mock executor cannot be used for real benchmark adapters", () => {
  assert.throws(() => realExecutorAdapter("mock"), /mock is proxy-only/);
  assert.equal(realExecutorAdapter("codex").displayName, "Codex CLI");
});

test("baseline comparison detects higher-is-better and lower-is-better regressions", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-real-benchmark-"));
  try {
    const baseline = benchmarkResult([benchmarkRun({ mode: "loop-enabled-harness", success: true, noProgress: false, elapsedMs: 10 })]);
    const current = benchmarkResult([benchmarkRun({ mode: "loop-enabled-harness", success: false, noProgress: true, elapsedMs: 20 })]);
    const baselinePath = path.join(directory, "baseline.json");
    writeFileSync(baselinePath, JSON.stringify(baseline));

    const comparison = compareRealBenchmark(current, baselinePath, 0.05);
    assert.equal(comparison.status, "regressed");
    assert.ok(comparison.regressions.some((item) => item.metric === "finalSuccessRate"));
    assert.ok(comparison.regressions.some((item) => item.metric === "noProgressRate"));
    assert.ok(comparison.regressions.some((item) => item.metric === "elapsedMs"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("real benchmark renderer exposes metadata, sample counts, and separation notice", () => {
  const result = benchmarkResult([benchmarkRun({ repetition: 2, seed: 17, promptHash: "prompt-hash" })]);
  const markdown = renderRealAgentBenchmark(result);
  assert.match(markdown, /# Real Executor Benchmark/);
  assert.match(markdown, /Samples: 1/);
  assert.match(markdown, /Repo commit:/);
  assert.match(markdown, /Command hash:/);
  assert.match(markdown, /Real executor metrics are reported separately/);
  assert.equal(result.runs[0]?.repetition, 2);
  assert.equal(result.runs[0]?.seed, 17);
  assert.equal(result.runs[0]?.promptHash, "prompt-hash");
});

function benchmarkRun(overrides: Partial<RealAgentBenchmarkRun> = {}): RealAgentBenchmarkRun {
  return {
    taskId: "task-1",
    fixture: "fixture",
    task: "Fix the fixture",
    mode: "context-pack",
    executor: "codex",
    workdir: "fixture-workdir",
    changedFiles: ["src/index.ts"],
    unrelatedChanges: 0,
    forbiddenFilesChanged: 0,
    passedTests: true,
    missingEvidence: 0,
    testsMissing: 0,
    testsFailed: 0,
    hallucinatedCommands: 0,
    loopCount: 1,
    iterationsToFinish: 1,
    finalDecision: "finalize",
    finalGate: "strong",
    finalDecisionAccuracy: true,
    humanReviewNeeded: false,
    hallucinationFindings: 0,
    regressionFindings: 0,
    exitCode: 0,
    repetition: 1,
    seed: 1,
    elapsedMs: 10,
    commandCount: 1,
    tokenUsage: 100,
    estimatedCostUsd: 0.01,
    promptHash: "hash",
    noProgress: false,
    success: true,
    contextRecallAtK: 0.75,
    contextPrecisionAtK: 0.5,
    ...overrides
  };
}

function benchmarkResult(runs: RealAgentBenchmarkRun[]): RealAgentBenchmarkResult {
  return {
    schemaVersion: "opencode-plusplus.real-agent-benchmark.v1",
    kind: "real-executor",
    generatedAt: "2026-07-15T00:00:00.000Z",
    benchmarkDir: "benchmarks",
    adapter: realExecutorAdapter("codex"),
    executor: { name: "codex", model: "test-model", version: "1.0.0", commandHash: "command-hash" },
    environment: { repoCommit: "commit", nodeVersion: process.version, platform: process.platform, arch: process.arch },
    config: {
      repetitions: 1,
      seeds: [1],
      maxLoops: 3,
      failOn: "required",
      modes: ["context-pack"],
      taskIds: ["task-1"],
      regressionThreshold: 0.05
    },
    sampleCount: runs.length,
    runs,
    metrics: summarizeRealRuns(runs),
    baseline: { status: "not-compared", threshold: 0.05, regressions: [] },
    outputFiles: []
  };
}
