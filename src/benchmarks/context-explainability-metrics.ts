import type { ApplicationContextStatus } from "../application/context-tools-service.js";
import { getContextFiles } from "../application/context-service.js";
import { retrieveApplicationContext } from "../application/retrieval-service.js";
import { summarizeDistribution } from "./statistics.js";
import type {
  ContextExplainabilityBenchmarkResult,
  ContextExplainabilityInterventionEvent,
  ContextExplainabilitySample,
  ContextExplainabilitySampleMetrics,
  ContextExplainabilityScenarioDefinition
} from "./context-explainability-types.js";

export interface BuildExplainabilitySampleMetricsInput {
  definition: ContextExplainabilityScenarioDefinition;
  retrieval: Awaited<ReturnType<typeof retrieveApplicationContext>>;
  fetched: Awaited<ReturnType<typeof getContextFiles>>;
  fetchedAgain: Awaited<ReturnType<typeof getContextFiles>>;
  fullContext: Awaited<ReturnType<typeof getContextFiles>>;
  status: ApplicationContextStatus;
  selectedFiles: string[];
  rejectedFiles: string[];
  events: ContextExplainabilityInterventionEvent[];
  topK: number;
}

export function summarizeExplainabilityMetrics(samples: ContextExplainabilitySample[]): ContextExplainabilityBenchmarkResult["metrics"] {
  const keys: Array<keyof ContextExplainabilitySampleMetrics> = [
    "precisionAtK",
    "recallAtK",
    "selectedFilesAccuracy",
    "rejectedFilesAccuracy",
    "contextCacheHitRate",
    "contextFetchDurationMs",
    "staleContextDetectionRate",
    "interventionDetectionAccuracy",
    "verifiedFixPrecision",
    "falseFixedRate",
    "unresolvedBlockerRecall",
    "humanReviewRate",
    "tokenSavings"
  ];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        value: summarizeDistribution(samples.map((sample) => sample.metrics[key])),
        unit: key === "contextFetchDurationMs" ? "milliseconds" : "ratio"
      }
    ])
  ) as ContextExplainabilityBenchmarkResult["metrics"];
}

export function buildExplainabilitySampleMetrics(input: BuildExplainabilitySampleMetricsInput): ContextExplainabilitySampleMetrics {
  const expected = new Set(input.definition.relevantFiles);
  const expectedRejected = new Set(input.definition.rejectedFiles);
  const selected = new Set(input.selectedFiles);
  const rejected = new Set(input.rejectedFiles);
  const terminalEvents = terminalInterventionEvents(input.events);
  const verified = terminalEvents.filter((event) => event.status === "verified");
  const validVerified = verified.filter((event) => event.evidenceRefs.includes("benchmark-command") && event.currentWorkingTree);
  const staleScenario = input.definition.scenario === "stale-context" || input.definition.scenario === "success-then-edit";
  const blockingScenario = input.definition.scenario !== "positive";
  return {
    precisionAtK: input.topK ? [...selected].filter((file) => expected.has(file)).length / input.topK : 0,
    recallAtK: expected.size ? [...selected].filter((file) => expected.has(file)).length / expected.size : 1,
    selectedFilesAccuracy: selected.size ? [...selected].filter((file) => expected.has(file)).length / selected.size : 1,
    rejectedFilesAccuracy: rejected.size ? [...rejected].filter((file) => expectedRejected.has(file)).length / rejected.size : 1,
    contextCacheHitRate: input.fetchedAgain.cache.status === "hit" ? 1 : 0,
    contextFetchDurationMs: input.fetchedAgain.durationMs,
    staleContextDetectionRate: staleScenario ? (input.status.freshness.status === "stale" ? 1 : 0) : null,
    interventionDetectionAccuracy: input.events.length > 0 ? 1 : 0,
    verifiedFixPrecision: verified.length ? validVerified.length / verified.length : null,
    falseFixedRate: verified.length ? (verified.length - validVerified.length) / verified.length : null,
    unresolvedBlockerRecall: blockingScenario
      ? terminalEvents.some((event) => ["prevented", "human-review", "stale", "unresolved"].includes(event.status))
        ? 1
        : 0
      : null,
    humanReviewRate: input.events.some((event) => event.status === "human-review") ? 1 : 0,
    tokenSavings: tokenSavings(input.fetched, input.fullContext)
  };
}

function terminalInterventionEvents(events: ContextExplainabilityInterventionEvent[]): ContextExplainabilityInterventionEvent[] {
  const latestByIntervention = new Map<string, ContextExplainabilityInterventionEvent>();
  for (const event of events) latestByIntervention.set(event.interventionId, event);
  return [...latestByIntervention.values()];
}

function tokenSavings(selected: Awaited<ReturnType<typeof getContextFiles>>, full: Awaited<ReturnType<typeof getContextFiles>>): number {
  const fullTokens = (full.files ?? []).reduce((total, file) => total + approximateTokens(file.content), 0);
  const selectedTokens = (selected.files ?? []).reduce((total, file) => total + approximateTokens(file.content), 0);
  if (fullTokens <= 0) return 0;
  return Math.max(0, (fullTokens - selectedTokens) / fullTokens);
}

function approximateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}
