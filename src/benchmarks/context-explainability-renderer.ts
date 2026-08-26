import { code, heading, table } from "../outputs/renderers/markdown.js";
import type { ContextExplainabilityBenchmarkResult } from "./context-explainability-types.js";

export function renderContextExplainabilityBenchmark(result: ContextExplainabilityBenchmarkResult): string {
  const metricRows = Object.entries(result.metrics).map(([name, metric]) => [
    name,
    metric.unit,
    String(metric.value.samples),
    formatMetric(metric.value.mean),
    formatMetric(metric.value.median),
    formatMetric(metric.value.standardDeviation),
    metric.value.confidence95 ? `${formatMetric(metric.value.confidence95.low)} - ${formatMetric(metric.value.confidence95.high)}` : "n/a"
  ]);
  const sampleRows = result.samples.map((sample) => [
    sample.sampleId,
    sample.scenario,
    sample.taskType,
    sample.finalDecision,
    sample.selectedFiles.join(", ") || "none",
    sample.rejectedFiles.join(", ") || "none",
    formatMetric(sample.metrics.precisionAtK),
    formatMetric(sample.metrics.recallAtK),
    String(sample.interventionEvents.length)
  ]);
  return [
    heading(1, "Deterministic Context Explainability Benchmark"),
    "",
    `Source: ${result.source}`,
    `Benchmark dir: ${code(result.benchmarkDir)}`,
    `Samples: ${result.sampleCount}`,
    "Metric class: mock fixture proxy; real executor metrics are excluded.",
    "Verified fixes require current command or CI evidence; prevention is not repair success.",
    "",
    heading(2, "Metric Distributions"),
    table(["Metric", "Unit", "N", "Mean", "Median", "Std dev", "95% CI"], metricRows),
    "",
    heading(2, "Samples"),
    table(["Sample", "Scenario", "Type", "Decision", "Selected", "Rejected", "P@K", "R@K", "Interventions"], sampleRows),
    "",
    heading(2, "Interpretation"),
    "- `selectedFiles` and `rejectedFiles` are evaluated separately; a rejected file is not silently treated as a retrieval miss.",
    "- `verifiedFixPrecision` counts only verified events with valid current-working-tree command evidence.",
    "- `falseFixedRate` counts verified claims without valid current evidence.",
    "- stale Context, wrong annotations, wrong commands, and success-then-edit are explicit negative scenarios."
  ].join("\n");
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : Number.isInteger(value) ? String(value) : value.toFixed(4);
}
