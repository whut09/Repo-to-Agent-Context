import { writeExecutionTrace, type ExecutionTrace, type ExecutionTraceStep } from "./execution-trace.js";
import { appendInterventionEvent, interventionIdFor, listInterventionEvents, type NewInterventionEvent } from "./intervention-ledger.js";
import type { HarnessDecision, InterventionStatus, ResolutionEvidence } from "../types.js";
import type { GuardFindingsArtifact } from "../../outputs/guard-finding.js";
import type { GuardGateReport } from "../../outputs/guard-gates.js";
import type { PolicyEngineReport, PolicyFinding } from "../verification-plane/policy-engine.js";

export interface RecordIterationInterventionsInput {
  root: string;
  taskId: string;
  sessionId: string;
  iteration: number;
  changedFiles: string[];
  currentWorkingTreeHash: string;
  trace: ExecutionTrace | null;
  policy: PolicyEngineReport;
  guardFindings: GuardFindingsArtifact;
  guardGates: GuardGateReport;
  decision: HarnessDecision;
  executorExitCode: number | null;
}

export interface RecordIterationInterventionsResult {
  decision: HarnessDecision;
  interventionIds: string[];
  events: ReturnType<typeof appendInterventionEvent>[];
}

export function recordIterationInterventions(input: RecordIterationInterventionsInput): RecordIterationInterventionsResult {
  const events: ReturnType<typeof appendInterventionEvent>[] = [];
  const allIds = new Set<string>();
  const evidence = currentEvidence(input.trace, input.currentWorkingTreeHash);

  for (const finding of input.policy.findings) {
    const category = categoryForFinding(finding);
    const interventionId = interventionIdFor({ taskId: input.taskId, findingId: finding.id, category, problem: finding.message });
    finding.interventionIds = [interventionId];
    const result = input.policy.results.find((item) => item.id === finding.id);
    if (result) result.interventionIds = [interventionId];
    allIds.add(interventionId);
    const status = statusForFinding(finding, evidence);
    for (const step of traceEvidenceForFinding(finding, input.trace)) {
      step.interventionIds = [...new Set([...(step.interventionIds ?? []), interventionId])].sort((a, b) => a.localeCompare(b));
    }
    events.push(
      ...appendForStatus(input, {
        interventionId,
        findingId: finding.id,
        category,
        problem: finding.message,
        action: finding.requiredAction ?? "observe policy result",
        targetFiles: finding.file ? [finding.file] : input.changedFiles,
        evidenceRefs: finding.evidence,
        status,
        source: finding.kind === "forbidden" ? "guard" : "policy",
        resolutionEvidence: resolutionEvidenceForFinding(finding, evidence)
      })
    );
  }

  for (const suggestion of [
    ...(input.policy.contextPolicy?.intervention.adoptedSuggestions ?? []),
    ...(input.policy.contextPolicy?.intervention.availableSuggestions ?? []),
    ...(input.policy.contextPolicy?.intervention.rejectedSuggestions ?? [])
  ]) {
    const interventionId = interventionIdFor({ taskId: input.taskId, findingId: suggestion.id, category: "context", problem: suggestion.summary });
    const rejected = suggestion.disposition === "rejected";
    allIds.add(interventionId);
    events.push(
      ...appendForStatus(input, {
        interventionId,
        findingId: suggestion.id,
        category: "context",
        problem: suggestion.summary,
        action: rejected ? "do not execute or treat as verification" : suggestion.disposition === "adopted" ? "use as contextual guidance" : "keep available for review",
        targetFiles: suggestion.sourceFile ? [suggestion.sourceFile] : input.changedFiles,
        evidenceRefs: [suggestion.reason, ...(input.policy.contextPolicy?.provenance.map((item) => `${item.sourceName}:${item.contentHash}`) ?? [])],
        status: rejected ? "prevented" : "observed",
        source: "policy",
        confidence: rejected ? 0.95 : 0.7,
        afterState: { disposition: suggestion.disposition, reason: suggestion.reason, suggestedCommand: suggestion.suggestedCommand ?? null }
      })
    );
  }

  for (const finding of input.guardFindings.findings) {
    const interventionId = interventionIdFor({ taskId: input.taskId, findingId: finding.id, category: finding.source, problem: finding.message });
    finding.interventionIds = [interventionId];
    allIds.add(interventionId);
    const isBlocking = finding.status === "failed" || finding.status === "missing";
    events.push(
      ...appendForStatus(input, {
        interventionId,
        findingId: finding.id,
        category: finding.source,
        problem: finding.message,
        action: finding.requiredAction ?? "observe guard finding",
        targetFiles: finding.file ? [finding.file] : input.changedFiles,
        evidenceRefs: finding.evidence,
        status: finding.source === "hallucination" && isBlocking ? "prevented" : isBlocking ? "requested" : "observed",
        source: "guard"
      })
    );
  }

  for (const gate of input.guardGates.gates) {
    const category = gate.guard;
    const interventionId = interventionIdFor({ taskId: input.taskId, findingId: gate.id, category, problem: gate.condition });
    gate.interventionIds = [interventionId];
    allIds.add(interventionId);
    if (gate.status === "blocked") {
      events.push(
        ...appendForStatus(input, {
          interventionId,
          findingId: gate.id,
          category,
          problem: gate.condition,
          action: gate.action,
          targetFiles: input.changedFiles,
          evidenceRefs: gate.evidence,
          status: statusForGate(gate.guard, gate.action, input.executorExitCode),
          source: "guard",
          confidence: 0.9
        })
      );
    }
  }

  input.guardGates.interventionIds = input.guardGates.gates.flatMap((gate) => gate.interventionIds ?? []).sort((a, b) => a.localeCompare(b));
  input.guardFindings.interventionIds = input.guardFindings.findings.flatMap((finding) => finding.interventionIds ?? []).sort((a, b) => a.localeCompare(b));
  if (input.trace && input.trace.steps.some((step) => step.interventionIds?.length)) writeExecutionTrace(input.root, input.trace);

  const decisionId = `decision:${input.taskId}:${input.iteration}`;
  const decisionInterventionId = interventionIdFor({ taskId: input.taskId, findingId: decisionId, category: "decision", problem: input.decision.action });
  allIds.add(decisionInterventionId);
  events.push(
    ...appendForStatus(input, {
      interventionId: decisionInterventionId,
      findingId: decisionId,
      category: "decision",
      problem: input.decision.reasons[0] ?? `Decision: ${input.decision.action}.`,
      action: input.decision.action,
      targetFiles: input.changedFiles,
      evidenceRefs: input.decision.reasons,
      status: statusForDecision(input.decision.action, evidence),
      source: "decision",
      decisionRefs: [decisionId],
      resolutionEvidence: toResolutionEvidence(evidence)
    })
  );

  const decision = {
    ...input.decision,
    interventionIds: [...new Set([...(input.decision.interventionIds ?? []), ...allIds])].sort((a, b) => a.localeCompare(b)),
    arbitration: input.decision.arbitration
      ? {
          ...input.decision.arbitration,
          interventionIds: [...new Set([...(input.decision.arbitration.interventionIds ?? []), ...allIds])].sort((a, b) => a.localeCompare(b))
        }
      : undefined
  };
  return { decision, interventionIds: [...allIds].sort((a, b) => a.localeCompare(b)), events };
}

type PendingIntervention = Omit<NewInterventionEvent, "taskId" | "sessionId" | "timestamp" | "phase" | "confidence" | "beforeState" | "afterState"> & {
  confidence?: number;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
};

function appendForStatus(input: RecordIterationInterventionsInput, event: PendingIntervention): ReturnType<typeof appendInterventionEvent>[] {
  const previous = listInterventionEvents(input.root, input.taskId)
    .filter((item) => item.interventionId === event.interventionId)
    .at(-1);
  if (previous && event.status === "observed") return [];
  const statuses: InterventionStatus[] = [];
  if (event.status === "verified" && !previous) statuses.push("requested", "repaired");
  else if (event.status === "verified" && ["requested", "stale", "unresolved", "human-review"].includes(previous?.status ?? "")) statuses.push("repaired");
  else if (event.status === "stale" && !previous) statuses.push("requested");
  statuses.push(event.status);
  return statuses.map((status) =>
    appendInterventionEvent(input.root, {
      ...event,
      taskId: input.taskId,
      sessionId: input.sessionId,
      timestamp: new Date().toISOString(),
      phase: "evaluate",
      status,
      beforeState: event.beforeState ?? { status: previous?.status ?? "none", workingTreeHash: previous?.afterState.workingTreeHash ?? null },
      afterState: event.afterState ?? { status, workingTreeHash: input.currentWorkingTreeHash },
      confidence: event.confidence ?? 0.85,
      supersedes: previous ? [previous.eventId] : undefined,
      traceRefs: input.trace ? [input.trace.id] : undefined
    })
  );
}

function statusForFinding(finding: PolicyFinding, evidence: ExecutionTraceStep[]): InterventionStatus {
  if (finding.evidence.some((item) => /stale|before last edit|working tree hash mismatch/i.test(item))) return "stale";
  if (finding.kind === "forbidden" && finding.status === "failed") return "prevented";
  if (finding.kind === "risk" || finding.status === "warning") return "human-review";
  if (
    finding.kind === "required" &&
    finding.status === "satisfied" &&
    resolutionEvidenceForFinding(finding, evidence).some((item) => item.valid && item.currentWorkingTree)
  )
    return "verified";
  if (finding.status === "missing" || finding.status === "failed") return "requested";
  return "observed";
}

function statusForGate(guard: string, action: string, executorExitCode: number | null): InterventionStatus {
  if (guard === "boundary" || action === "rollback" || action === "block") return "prevented";
  if (guard === "evidence" && action === "repair") return "unresolved";
  if ((action === "repair" || action === "run-tests" || action === "run-regression-tests") && executorExitCode !== 0) return "unresolved";
  if (action === "human-review") return "human-review";
  return "requested";
}

function statusForDecision(action: HarnessDecision["action"], evidence: ExecutionTraceStep[]): InterventionStatus {
  if (action === "rollback" || action === "block") return "prevented";
  if (action === "executor-failure" || action === "no-progress" || action === "max-loops-reached") return "unresolved";
  if (action === "human-review") return "human-review";
  if (action === "finalize" && evidence.some((step) => step.exitCode === 0 && step.workingTreeHashAfter)) return "verified";
  if (action === "repair" || action === "run-tests" || action === "repack") return "requested";
  return "observed";
}

function categoryForFinding(
  finding: PolicyFinding
): "boundary" | "evidence" | "policy" | "context" | "hallucination" | "regression" | "repair" | "executor" | "decision" | "other" {
  if (finding.id.includes("tests") || finding.id.includes("contract-validation")) return "evidence";
  if (finding.id.includes("context")) return "context";
  if (finding.kind === "forbidden") return "boundary";
  return "policy";
}

function evidenceForFinding(finding: PolicyFinding, evidence: ExecutionTraceStep[]): ExecutionTraceStep[] {
  if (finding.id.includes("tests")) return evidence.filter((step) => /test|verify|check|lint|typecheck/i.test(`${step.action} ${step.command ?? ""}`));
  if (finding.id.includes("contract-validation")) return evidence.filter((step) => /contract|validate/i.test(`${step.action} ${step.command ?? ""}`));
  return [];
}

function traceEvidenceForFinding(finding: PolicyFinding, trace: ExecutionTrace | null): ExecutionTraceStep[] {
  const steps = trace?.steps ?? [];
  if (finding.id.includes("tests")) return steps.filter((step) => /test|verify|check|lint|typecheck/i.test(`${step.action} ${step.command ?? ""}`));
  if (finding.id.includes("contract-validation")) return steps.filter((step) => /contract|validate/i.test(`${step.action} ${step.command ?? ""}`));
  return [];
}

function resolutionEvidenceForFinding(finding: PolicyFinding, evidence: ExecutionTraceStep[]): ResolutionEvidence[] {
  return toResolutionEvidence(evidenceForFinding(finding, evidence));
}

function toResolutionEvidence(steps: ExecutionTraceStep[]): ResolutionEvidence[] {
  return steps.map((step) => ({
    kind: step.evidenceSource === "ci" ? "ci" : "command",
    ref: step.id,
    workingTreeHash: step.workingTreeHashAfter,
    currentWorkingTree: true,
    valid: step.exitCode === 0,
    details: step.command ? [step.command] : [step.action]
  }));
}

function currentEvidence(trace: ExecutionTrace | null, hash: string): ExecutionTraceStep[] {
  return (trace?.steps ?? []).filter(
    (step) => (step.evidenceSource === "command" || step.evidenceSource === "ci") && step.exitCode === 0 && step.workingTreeHashAfter === hash
  );
}
