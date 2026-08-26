import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  renderContextExplainabilityBenchmark,
  runContextExplainabilityBenchmark,
  summarizeExplainabilityMetrics
} from "../src/benchmarks/context-explainability.js";

test("deterministic Context explainability benchmark records provenance and negative cases", async () => {
  const result = await runContextExplainabilityBenchmark({ benchmarkDir: path.resolve("benchmarks") });
  assert.equal(result.kind, "deterministic-context-explainability");
  assert.equal(result.source, "mock-fixture");
  assert.equal(result.sampleCount, 6);
  assert.equal(result.samples.length, 6);
  assert.equal(result.separation.mockProxyOnly, true);
  assert.equal(result.separation.realExecutorMetricsExcluded, true);
  assert.ok(result.samples.every((sample) => /^[a-f0-9]{64}$/.test(sample.promptHash)));
  assert.ok(result.samples.every((sample) => /^[a-f0-9]{40}$/.test(sample.repoCommit)));
  assert.ok(result.samples.every((sample) => sample.scoreBreakdown.length > 0));
  assert.ok(result.samples.every((sample) => sample.contextSelectedFiles.length > 0));
  assert.ok(result.samples.some((sample) => sample.contextOmittedFiles.length > 0));
  assert.ok(result.samples.some((sample) => sample.contextOmittedFiles.length === 0));
  assert.ok(result.samples.every((sample) => /^[a-f0-9]{64}$/.test(sample.contextFetch.contentHash)));
  assert.ok(result.samples.every((sample) => sample.contextFetch.cacheStatus === "hit"));
  assert.ok(result.samples.some((sample) => sample.scenario === "similar-unrelated"));
  assert.ok(result.samples.some((sample) => sample.scenario === "stale-context"));
  assert.ok(result.samples.some((sample) => sample.scenario === "wrong-command"));
  assert.ok(result.samples.every((sample) => sample.interventionEvents.length > 0));
  assert.equal(result.metrics.precisionAtK.value.samples, 6);
  assert.equal(result.metrics.contextFetchDurationMs.value.samples, 6);
  assert.deepEqual(
    {
      stale: result.metrics.staleContextDetectionRate.value.samples,
      verified: result.metrics.verifiedFixPrecision.value.samples,
      falseFixed: result.metrics.falseFixedRate.value.samples,
      unresolved: result.metrics.unresolvedBlockerRecall.value.samples
    },
    { stale: 2, verified: 1, falseFixed: 1, unresolved: 5 }
  );
  assert.equal(result.metrics.staleContextDetectionRate.value.mean, 1);
  assert.equal(result.metrics.verifiedFixPrecision.value.mean, 1);
  assert.equal(result.metrics.falseFixedRate.value.mean, 0);
  assert.equal(result.metrics.unresolvedBlockerRecall.value.mean, 1);
  assert.equal(result.metrics.finalDecisionAccuracy.value.samples, 6);
  assert.equal(result.metrics.finalDecisionAccuracy.value.mean, 1);
  const successThenEdit = result.samples.find((sample) => sample.scenario === "success-then-edit");
  assert.equal(successThenEdit?.metrics.verifiedFixPrecision, null);
  assert.equal(successThenEdit?.metrics.falseFixedRate, null);
  const markdown = renderContextExplainabilityBenchmark(result);
  assert.match(markdown, /# Deterministic Context Explainability Benchmark/);
  assert.match(markdown, /Metric Distributions/);
  assert.match(markdown, /falseFixedRate/);
  assert.match(markdown, /mock fixture proxy/);
});

test("explainability metric summaries retain distribution statistics", () => {
  const summary = summarizeExplainabilityMetrics([]);
  assert.equal(summary.precisionAtK.value.samples, 0);
  assert.equal(summary.contextFetchDurationMs.unit, "milliseconds");
  assert.equal(summary.tokenSavings.unit, "ratio");
});
