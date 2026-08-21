export type HarnessDecisionAction =
  | "finalize"
  | "repair"
  | "repack"
  | "run-tests"
  | "rollback"
  | "block"
  | "human-review"
  | "executor-failure"
  | "no-progress"
  | "max-loops-reached";

export interface ArtifactRef {
  path: string;
  kind?: "context" | "trace" | "policy" | "guard" | "loop" | "decision" | "report" | "diff" | "checkpoint" | "run" | "other";
  description?: string;
}

export type HarnessDecisionCandidateSource = "executor" | "policy" | "guard-gate" | "loop" | "risk" | "fallback";

export interface HarnessDecisionCandidate {
  id: string;
  source: HarnessDecisionCandidateSource;
  action: HarnessDecisionAction;
  priority: number;
  blocking: boolean;
  confidence: number;
  reasons: string[];
  requiredCommands: string[];
  artifacts: ArtifactRef[];
}

export interface HarnessDecisionArbitration {
  selectedCandidate: HarnessDecisionCandidate;
  selectedPriority: number;
  supportingCandidates: HarnessDecisionCandidate[];
}

export interface HarnessDecision {
  action: HarnessDecisionAction;
  blocking: boolean;
  confidence: number;
  reasons: string[];
  requiredCommands: string[];
  artifacts: ArtifactRef[];
  arbitration?: HarnessDecisionArbitration;
}

export type GuardResultSource = "policy" | "hallucination" | "regression" | "context" | "boundary" | "evidence";
export type GuardResultKind = "forbidden" | "required" | "risk" | "info";
export type GuardResultStatus = "failed" | "missing" | "warning" | "satisfied" | "passed";
export type GuardResultSeverity = "error" | "warning" | "required" | "info";

export interface GuardResult {
  id: string;
  source: GuardResultSource;
  kind: GuardResultKind;
  status: GuardResultStatus;
  severity: GuardResultSeverity;
  message: string;
  blocking: boolean;
  confidence: number;
  reasons: string[];
  requiredCommands: string[];
  artifacts: ArtifactRef[];
  file?: string;
  evidence: string[];
}

export function createHarnessDecision(input: HarnessDecision): HarnessDecision {
  return {
    action: input.action,
    blocking: input.blocking,
    confidence: clampConfidence(input.confidence),
    reasons: dedupe(input.reasons.filter(Boolean)),
    requiredCommands: dedupe(input.requiredCommands.filter(Boolean)),
    artifacts: dedupeArtifacts(input.artifacts),
    ...(input.arbitration ? { arbitration: normalizeArbitration(input.arbitration) } : {})
  };
}

export function createGuardResult(input: GuardResult): GuardResult {
  return {
    ...input,
    confidence: clampConfidence(input.confidence),
    reasons: dedupe(input.reasons.filter(Boolean)),
    requiredCommands: dedupe(input.requiredCommands.filter(Boolean)),
    artifacts: dedupeArtifacts(input.artifacts),
    evidence: dedupe(input.evidence.filter(Boolean))
  };
}

export function clampConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function dedupeArtifacts(items: ArtifactRef[]): ArtifactRef[] {
  const seen = new Set<string>();
  const result: ArtifactRef[] = [];
  for (const item of items) {
    const key = `${item.kind ?? "other"}:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function normalizeArbitration(arbitration: HarnessDecisionArbitration): HarnessDecisionArbitration {
  return {
    selectedCandidate: normalizeCandidate(arbitration.selectedCandidate),
    selectedPriority: arbitration.selectedPriority,
    supportingCandidates: arbitration.supportingCandidates.map(normalizeCandidate)
  };
}

function normalizeCandidate(candidate: HarnessDecisionCandidate): HarnessDecisionCandidate {
  return {
    ...candidate,
    confidence: clampConfidence(candidate.confidence),
    reasons: dedupe(candidate.reasons.filter(Boolean)),
    requiredCommands: dedupe(candidate.requiredCommands.filter(Boolean)),
    artifacts: dedupeArtifacts(candidate.artifacts)
  };
}
