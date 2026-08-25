import type { HallucinationGuardReport } from "../harness/verification-plane/guards/hallucination.js";
import type { PolicyEngineReport } from "../harness/verification-plane/policy-engine.js";
import type { RegressionGuardReport } from "../harness/verification-plane/guards/regression.js";
import type { GuardResult } from "../harness/types.js";

export type GuardFindingSource = "policy" | "hallucination" | "regression";
export type GuardFindingKind = "forbidden" | "required" | "risk" | "info";
export type GuardFindingStatus = "failed" | "missing" | "warning" | "satisfied" | "passed";
export type GuardFindingSeverity = "error" | "warning" | "required" | "info";

export interface GuardFinding {
  schemaVersion: "opencode-plusplus.guard-finding.v1";
  id: string;
  source: GuardFindingSource;
  kind: GuardFindingKind;
  status: GuardFindingStatus;
  severity: GuardFindingSeverity;
  message: string;
  file?: string;
  evidence: string[];
  requiredAction?: string;
  interventionIds?: string[];
}

export interface GuardFindingsArtifact {
  schemaVersion: "opencode-plusplus.guard-findings.v1";
  kind: "guard-findings";
  generatedAt: string;
  runId: string;
  iteration: number;
  findings: GuardFinding[];
  summary: {
    total: number;
    forbidden: number;
    requiredMissing: number;
    risks: number;
    hallucinationErrors: number;
    regressionMatches: number;
  };
}

function guardFindingFromResult(result: GuardResult): GuardFinding {
  return {
    schemaVersion: "opencode-plusplus.guard-finding.v1",
    id: result.id,
    source: result.source === "policy" || result.source === "hallucination" || result.source === "regression" ? result.source : "policy",
    kind: result.kind,
    status: result.status,
    severity: result.severity,
    message: result.message,
    file: result.file,
    evidence: result.evidence,
    requiredAction: result.requiredCommands[0],
    interventionIds: result.interventionIds
  };
}

export function buildGuardFindingsArtifact(input: {
  runId: string;
  iteration: number;
  generatedAt?: string;
  policy: PolicyEngineReport;
  hallucination: HallucinationGuardReport;
  regression: RegressionGuardReport;
}): GuardFindingsArtifact {
  const findings = [...input.policy.results, ...input.hallucination.results, ...input.regression.results].map(guardFindingFromResult);

  return {
    schemaVersion: "opencode-plusplus.guard-findings.v1",
    kind: "guard-findings",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runId: input.runId,
    iteration: input.iteration,
    findings,
    summary: {
      total: findings.length,
      forbidden: findings.filter((finding) => finding.kind === "forbidden" && finding.status === "failed").length,
      requiredMissing: findings.filter((finding) => finding.kind === "required" && finding.status === "missing").length,
      risks: findings.filter((finding) => finding.kind === "risk").length,
      hallucinationErrors: input.hallucination.summary.errors,
      regressionMatches: input.regression.summary.matches
    }
  };
}
