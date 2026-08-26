import type { RetrievalScoreBreakdown } from "../retrievers/types.js";
import type { DistributionSummary } from "./statistics.js";

export const CONTEXT_EXPLAINABILITY_SCHEMA_VERSION = "opencode-plusplus.context-explainability.v1" as const;

export type ExplainabilityScenario = "positive" | "similar-unrelated" | "stale-context" | "wrong-annotation" | "wrong-command" | "success-then-edit";

export interface ContextExplainabilityScenarioDefinition {
  id: string;
  taskId: string;
  fixture: string;
  task: string;
  taskType: "bugfix" | "feature" | "refactor";
  source: string;
  packageVersion: string;
  contentRevision: number;
  scenario: ExplainabilityScenario;
  relevantFiles: string[];
  rejectedFiles: string[];
  negativeExamples?: string[];
}

export interface ContextExplainabilitySampleMetrics {
  precisionAtK: number;
  recallAtK: number;
  selectedFilesAccuracy: number;
  rejectedFilesAccuracy: number;
  contextCacheHitRate: number;
  contextFetchDurationMs: number;
  staleContextDetectionRate: number | null;
  interventionDetectionAccuracy: number;
  verifiedFixPrecision: number | null;
  falseFixedRate: number | null;
  unresolvedBlockerRecall: number | null;
  humanReviewRate: number;
  finalDecisionAccuracy: number;
  tokenSavings: number;
}

export interface ContextExplainabilityInterventionEvent {
  eventId: string;
  interventionId: string;
  status: string;
  category: string;
  problem: string;
  evidenceRefs: string[];
  currentWorkingTree: boolean;
}

export interface ContextExplainabilitySample {
  sampleId: string;
  taskId: string;
  taskType: ContextExplainabilityScenarioDefinition["taskType"];
  repositoryFixture: string;
  source: string;
  packageVersion: string;
  contentRevision: number;
  promptHash: string;
  repoCommit: string;
  scenario: ExplainabilityScenario;
  selectedFiles: string[];
  rejectedFiles: string[];
  contextSelectedFiles: string[];
  contextOmittedFiles: string[];
  contextFetch: {
    cacheStatus: "hit" | "miss";
    contextMode: "reused" | "incremental" | "rebuilt";
    freshness: "fresh" | "stale";
    contentHash: string;
  };
  scoreBreakdown: RetrievalScoreBreakdown[];
  interventionEvents: ContextExplainabilityInterventionEvent[];
  finalDecision: "finalize" | "human-review" | "block" | "repair";
  expectedDecision: ContextExplainabilitySample["finalDecision"];
  metrics: ContextExplainabilitySampleMetrics;
}

export interface ContextExplainabilityMetricSummary {
  value: DistributionSummary;
  unit: "ratio" | "milliseconds";
}

export interface ContextExplainabilityBenchmarkResult {
  schemaVersion: typeof CONTEXT_EXPLAINABILITY_SCHEMA_VERSION;
  kind: "deterministic-context-explainability";
  generatedAt: string;
  benchmarkDir: string;
  source: "mock-fixture";
  sampleCount: number;
  samples: ContextExplainabilitySample[];
  metrics: Record<keyof ContextExplainabilitySampleMetrics, ContextExplainabilityMetricSummary>;
  separation: {
    mockProxyOnly: true;
    realExecutorMetricsExcluded: true;
    verifiedFixRequiresCurrentEvidence: true;
  };
}

export interface ContextExplainabilityOptions {
  benchmarkDir?: string;
  topK?: number;
  scenarios?: ContextExplainabilityScenarioDefinition[];
}
