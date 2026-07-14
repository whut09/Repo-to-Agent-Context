import type { AgentTarget, EvidencePolicyMode, TaskType } from "../../core/types.js";
import type { AgentExecutorName, OrchestratorCheckpointMode } from "../../harness/control-plane/orchestrator.js";
import type { ExecutionEvidenceSource, ExecutionFinalState, ExecutionStepResult } from "../../harness/observability/execution-trace.js";
import type { PolicyFailOn } from "../../harness/verification-plane/policy-engine.js";
import type { CodeIntelligenceBackend } from "../../integrations/codegraph.js";
import type { RetrieverProvider } from "../../retrievers/index.js";
import type { LoopPhase } from "../../harness/control-plane/loop-controller.js";

export interface RetrieveCliOptions {
  provider: RetrieverProvider;
  topK: number;
  modules?: string;
  changedFiles?: string;
  includeTests?: boolean;
  json?: boolean;
}

export function retrieveOptions(options: RetrieveCliOptions) {
  return {
    topK: options.topK,
    modules: splitCsv(options.modules),
    changedFiles: splitCsv(options.changedFiles),
    includeTests: options.includeTests ?? false
  };
}

export function splitCsv(value: string | undefined): string[] | undefined {
  const items =
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  return items.length ? items : undefined;
}

export function parseRetrieverProvider(value: string): RetrieverProvider {
  if (value === "static" || value === "ripgrep" || value === "hybrid" || value === "lightrag" || value === "embedding" || value === "codegraph") return value;
  throw new Error(`Unsupported retriever provider: ${value}`);
}

export function parseCodeBackend(value: string): CodeIntelligenceBackend {
  if (value === "internal" || value === "codegraph") return value;
  throw new Error(`Unsupported code intelligence backend: ${value}`);
}

export function parseTarget(value: string): AgentTarget {
  if (value === "opencode" || value === "codex" || value === "claude" || value === "cursor" || value === "all") {
    return value;
  }

  throw new Error(`Unsupported target: ${value}`);
}

export function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }

  return parsed;
}

export function parseTaskType(value: string): TaskType {
  if (value === "auto" || value === "bugfix" || value === "feature" || value === "refactor") return value;
  throw new Error(`Unsupported task type: ${value}`);
}

export function parseLoopPhase(value: string): LoopPhase {
  if (value === "preflight" || value === "after-edit" || value === "repair") return value;
  throw new Error(`Unsupported loop phase: ${value}`);
}

export function parseAgentExecutor(value: string): AgentExecutorName {
  if (value === "codex" || value === "claude-code" || value === "opencode" || value === "mimocode" || value === "cursor" || value === "mock") return value;
  throw new Error(`Unsupported agent executor: ${value}`);
}

export function parseOrchestratorCheckpoint(value: string): OrchestratorCheckpointMode {
  if (value === "none" || value === "git-worktree") return value;
  throw new Error(`Unsupported orchestrator checkpoint mode: ${value}`);
}

export function parseTraceResult(value: string): ExecutionStepResult {
  if (value === "passed" || value === "failed" || value === "skipped" || value === "unknown") return value;
  throw new Error(`Unsupported trace result: ${value}`);
}

export function parseTraceFinalState(value: string): ExecutionFinalState {
  if (value === "planned" || value === "in_progress" || value === "partial_success" || value === "success" || value === "failed" || value === "blocked")
    return value;
  throw new Error(`Unsupported trace final state: ${value}`);
}

export function parsePolicyFailOn(value: string): PolicyFailOn {
  if (value === "forbidden" || value === "required" || value === "risk") return value;
  throw new Error(`Unsupported policy failure threshold: ${value}`);
}

export function parseEvidencePolicy(value: string): EvidencePolicyMode {
  if (value === "advisory" || value === "balanced" || value === "strict") return value;
  throw new Error(`Unsupported evidence policy: ${value}`);
}

export function parseEvidenceSource(value: string): ExecutionEvidenceSource {
  if (value === "manual" || value === "command" || value === "ci") return value;
  throw new Error(`Unsupported evidence source: ${value}`);
}

export function parseNonNegativeInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got: ${value}`);
  }

  return parsed;
}

export function parseNullableInteger(value: string): number | null {
  if (value === "null" || value === "unknown") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected an integer, null, or unknown, got: ${value}`);
  }
  return parsed;
}
