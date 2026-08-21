import { createHash } from "node:crypto";
import type { HarnessDecision, HarnessDecisionAction } from "../types.js";

export type ConvergenceStatus = "progressing" | "terminal" | "repeated-state" | "max-loops-reached" | "executor-failure";
export type ConvergenceStopReason = "terminal-decision" | "repeated-state/no-progress" | "max-loops-reached" | "executor-failure";

export interface IterationStateFingerprintInput {
  workingTreeHash: string;
  decisionAction: HarnessDecisionAction;
  blockingFindingIds: string[];
  blockingGateIds: string[];
  missingEvidence: string[];
  requiredCommands: string[];
  contextFreshness: string;
  contextDrift: string;
  taskId?: string;
  sessionId?: string;
}

export interface IterationStateFingerprint {
  schemaVersion: "opencode-plusplus.iteration-fingerprint.v1";
  value: string;
  state: IterationStateFingerprintInput;
}

export interface ConvergenceResult {
  schemaVersion: "opencode-plusplus.convergence.v1";
  status: ConvergenceStatus;
  fingerprint: IterationStateFingerprint;
  previousFingerprint?: string;
  repeated: boolean;
  shouldStop: boolean;
  stopReason?: ConvergenceStopReason;
}

export interface EvaluateConvergenceInput {
  fingerprint: IterationStateFingerprint;
  previousFingerprint?: IterationStateFingerprint;
  decision: HarnessDecision;
  executorExitCode: number | null;
  loopIndex: number;
  maxLoops: number;
}

export function buildIterationStateFingerprint(input: IterationStateFingerprintInput): IterationStateFingerprint {
  const state: IterationStateFingerprintInput = {
    workingTreeHash: input.workingTreeHash,
    decisionAction: input.decisionAction,
    blockingFindingIds: normalizeStrings(input.blockingFindingIds),
    blockingGateIds: normalizeStrings(input.blockingGateIds),
    missingEvidence: normalizeStrings(input.missingEvidence),
    requiredCommands: normalizeStrings(input.requiredCommands),
    contextFreshness: input.contextFreshness,
    contextDrift: input.contextDrift,
    taskId: input.taskId ?? "",
    sessionId: input.sessionId ?? ""
  };
  const serialized = stableStringify({ schemaVersion: "opencode-plusplus.iteration-fingerprint.v1", state });
  return {
    schemaVersion: "opencode-plusplus.iteration-fingerprint.v1",
    value: createHash("sha256").update(serialized).digest("hex"),
    state
  };
}

export function evaluateConvergence(input: EvaluateConvergenceInput): ConvergenceResult {
  const previousFingerprint = input.previousFingerprint?.value;
  const repeated = Boolean(previousFingerprint && previousFingerprint === input.fingerprint.value && input.decision.blocking);
  const base = {
    schemaVersion: "opencode-plusplus.convergence.v1" as const,
    fingerprint: input.fingerprint,
    ...(previousFingerprint ? { previousFingerprint } : {}),
    repeated
  };

  if (input.executorExitCode !== 0) {
    return { ...base, status: "executor-failure", shouldStop: true, stopReason: "executor-failure" };
  }
  if (isTerminalAction(input.decision.action)) {
    return { ...base, status: "terminal", shouldStop: true, stopReason: "terminal-decision" };
  }
  if (repeated) {
    return { ...base, status: "repeated-state", shouldStop: true, stopReason: "repeated-state/no-progress" };
  }
  if (input.loopIndex === input.maxLoops) {
    return { ...base, status: "max-loops-reached", shouldStop: true, stopReason: "max-loops-reached" };
  }
  return { ...base, status: "progressing", shouldStop: false };
}

function isTerminalAction(action: HarnessDecisionAction): boolean {
  return ["finalize", "block", "rollback", "human-review", "executor-failure", "no-progress", "max-loops-reached"].includes(action);
}

function normalizeStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
