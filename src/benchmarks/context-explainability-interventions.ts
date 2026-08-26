import { appendInterventionEvent, createInterventionEvent, listInterventionEvents } from "../harness/observability/intervention-ledger.js";
import type {
  ContextExplainabilityInterventionEvent,
  ContextExplainabilitySample,
  ContextExplainabilityScenarioDefinition,
  ExplainabilityScenario
} from "./context-explainability-types.js";

export function createScenarioInterventions(
  root: string,
  definition: ContextExplainabilityScenarioDefinition,
  evidenceHash: string,
  currentWorkingTreeHash: string
): ContextExplainabilityInterventionEvent[] {
  const interventionId = `explainability-${definition.id}`;
  const problem = problemFor(definition.scenario);
  if (definition.scenario === "positive" || definition.scenario === "success-then-edit") {
    appendEvidenceLifecycle(root, definition, interventionId, problem, evidenceHash);
    if (definition.scenario === "success-then-edit") {
      appendInterventionEvent(
        root,
        createInterventionEvent({
          interventionId,
          taskId: definition.taskId,
          sessionId: "benchmark",
          timestamp: "2026-01-01T00:00:03.000Z",
          phase: "evaluate",
          category: "evidence",
          problem,
          targetFiles: definition.relevantFiles,
          action: "invalidate superseded evidence",
          beforeState: { status: "verified", workingTreeHash: evidenceHash },
          afterState: { status: "stale", workingTreeHash: currentWorkingTreeHash },
          evidenceRefs: ["success-then-edit"],
          status: "stale",
          confidence: 1,
          source: "system"
        })
      );
    }
  } else {
    appendBlockingIntervention(root, definition, interventionId, problem, currentWorkingTreeHash);
  }
  return listInterventionEvents(root, definition.taskId).map((event) => ({
    eventId: event.eventId,
    interventionId: event.interventionId,
    status: event.status,
    category: event.category,
    problem: event.problem,
    evidenceRefs: event.evidenceRefs,
    currentWorkingTree: event.resolutionEvidence?.some((item) => item.workingTreeHash === currentWorkingTreeHash && item.valid) ?? false
  }));
}

export function expectedDecisionFor(scenario: ExplainabilityScenario): ContextExplainabilitySample["finalDecision"] {
  return scenario === "positive" ? "finalize" : scenario === "wrong-command" || scenario === "similar-unrelated" ? "block" : "human-review";
}

export function decisionFromInterventions(events: Array<{ status: string }>): ContextExplainabilitySample["finalDecision"] {
  if (events.some((event) => event.status === "verified") && !events.some((event) => event.status === "stale")) return "finalize";
  if (events.some((event) => event.status === "prevented")) return "block";
  return "human-review";
}

function appendEvidenceLifecycle(
  root: string,
  definition: ContextExplainabilityScenarioDefinition,
  interventionId: string,
  problem: string,
  evidenceHash: string
): void {
  const common = {
    interventionId,
    taskId: definition.taskId,
    sessionId: "benchmark",
    phase: "evaluate" as const,
    category: "evidence" as const,
    problem,
    targetFiles: definition.relevantFiles,
    action: "verify current command evidence",
    evidenceRefs: ["benchmark-command"],
    confidence: 1,
    source: "system" as const
  };
  appendInterventionEvent(
    root,
    createInterventionEvent({
      ...common,
      timestamp: "2026-01-01T00:00:00.000Z",
      beforeState: {},
      afterState: { workingTreeHash: evidenceHash },
      status: "requested"
    })
  );
  appendInterventionEvent(
    root,
    createInterventionEvent({
      ...common,
      timestamp: "2026-01-01T00:00:01.000Z",
      beforeState: { status: "requested" },
      afterState: { workingTreeHash: evidenceHash },
      status: "repaired"
    })
  );
  appendInterventionEvent(
    root,
    createInterventionEvent({
      ...common,
      timestamp: "2026-01-01T00:00:02.000Z",
      beforeState: { status: "repaired" },
      afterState: { workingTreeHash: evidenceHash },
      resolutionEvidence: [
        {
          kind: "command",
          ref: "benchmark-command",
          workingTreeHash: evidenceHash,
          currentWorkingTree: true,
          valid: true,
          details: ["npm test"]
        }
      ],
      status: "verified"
    })
  );
}

function appendBlockingIntervention(
  root: string,
  definition: ContextExplainabilityScenarioDefinition,
  interventionId: string,
  problem: string,
  currentWorkingTreeHash: string
): void {
  const commandSuggestion = definition.scenario === "wrong-command";
  appendInterventionEvent(
    root,
    createInterventionEvent({
      interventionId,
      taskId: definition.taskId,
      sessionId: "benchmark",
      timestamp: "2026-01-01T00:00:00.000Z",
      phase: "evaluate",
      category: "context",
      problem,
      targetFiles: definition.relevantFiles,
      action: commandSuggestion ? "reject external command suggestion" : "request human review",
      beforeState: {},
      afterState: { workingTreeHash: currentWorkingTreeHash },
      evidenceRefs: [definition.scenario, ...(commandSuggestion ? ["Context command suggestion is untrusted"] : [])],
      status: expectedDecisionFor(definition.scenario) === "human-review" ? "human-review" : "prevented",
      confidence: 1,
      source: "system"
    })
  );
}

function problemFor(scenario: ExplainabilityScenario): string {
  const problems: Record<ExplainabilityScenario, string> = {
    positive: "Current command evidence verifies the selected Context.",
    "similar-unrelated": "A similar file is unrelated to the task.",
    "stale-context": "Context became stale after a working-tree change.",
    "wrong-annotation": "Annotation contains inaccurate guidance.",
    "wrong-command": "External Context suggested a command that must not be trusted.",
    "success-then-edit": "A successful test was superseded by a later edit."
  };
  return problems[scenario];
}
