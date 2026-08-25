import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { readJsonDiagnostic, updateJsonAtomic } from "../../core/atomic-store.js";
import { clampConfidence, type InterventionEvent, type InterventionStatus, type InterventionSummary, type ResolutionEvidence } from "../types.js";

export const INTERVENTION_SCHEMA_VERSION = "opencode-plusplus.intervention.v1";

export interface InterventionLedger {
  schemaVersion: typeof INTERVENTION_SCHEMA_VERSION;
  revision: number;
  taskId: string;
  events: InterventionEvent[];
}

export interface NewInterventionEvent extends Omit<InterventionEvent, "schemaVersion" | "eventId" | "sequence" | "revision"> {
  eventId?: string;
}

export function interventionLedgerPath(root: string, taskId: string): string {
  return path.join(root, ".agent-context", "interventions", `${safeLedgerId(taskId)}.json`);
}

export function interventionIdFor(input: Pick<NewInterventionEvent, "taskId" | "findingId" | "category" | "problem">): string {
  return `intervention-${digest([input.taskId, input.findingId ?? "", input.category, input.problem].join("\n"))}`;
}

export function eventIdFor(input: NewInterventionEvent): string {
  return `event-${digest(stableJson({
    interventionId: input.interventionId,
    status: input.status,
    phase: input.phase,
    action: input.action,
    evidenceRefs: [...input.evidenceRefs].sort(),
    resolutionEvidence: input.resolutionEvidence ?? []
  }))}`;
}

export function createInterventionEvent(input: NewInterventionEvent): InterventionEvent {
  return {
    schemaVersion: INTERVENTION_SCHEMA_VERSION,
    eventId: input.eventId ?? eventIdFor(input),
    interventionId: input.interventionId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    phase: input.phase,
    category: input.category,
    findingId: input.findingId,
    problem: input.problem,
    targetFiles: [...new Set(input.targetFiles)].sort((a, b) => a.localeCompare(b)),
    action: input.action,
    beforeState: input.beforeState,
    afterState: input.afterState,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort((a, b) => a.localeCompare(b)),
    status: input.status,
    confidence: clampConfidence(input.confidence),
    source: input.source,
    resolutionEvidence: input.resolutionEvidence,
    supersedes: input.supersedes ? [...new Set(input.supersedes)].sort((a, b) => a.localeCompare(b)) : undefined,
    traceRefs: input.traceRefs ? [...new Set(input.traceRefs)].sort((a, b) => a.localeCompare(b)) : undefined,
    decisionRefs: input.decisionRefs ? [...new Set(input.decisionRefs)].sort((a, b) => a.localeCompare(b)) : undefined
  };
}

export function readInterventionLedger(root: string, taskId: string): InterventionLedger | null {
  const filePath = interventionLedgerPath(root, taskId);
  if (!existsSync(filePath)) return null;
  const result = readJsonDiagnostic<InterventionLedger>(filePath);
  if (result.status === "corrupt") throw new Error(`Unable to read intervention ledger ${taskId}: ${result.error}`);
  if (result.status !== "ok") return null;
  if (result.value.schemaVersion !== INTERVENTION_SCHEMA_VERSION) {
    throw new Error(`Unsupported intervention ledger schemaVersion "${String(result.value.schemaVersion)}" for task ${taskId}; expected ${INTERVENTION_SCHEMA_VERSION}.`);
  }
  return result.value;
}

export function appendInterventionEvent(root: string, input: NewInterventionEvent | InterventionEvent): InterventionEvent {
  const event = "schemaVersion" in input ? input : createInterventionEvent(input);
  const filePath = interventionLedgerPath(root, event.taskId);
  let persisted = event;
  updateJsonAtomic<InterventionLedger>(filePath, (current) => {
    const ledger = current ?? {
      schemaVersion: INTERVENTION_SCHEMA_VERSION,
      revision: 0,
      taskId: event.taskId,
      events: []
    };
    if (ledger.schemaVersion !== INTERVENTION_SCHEMA_VERSION) {
      throw new Error(`Unsupported intervention ledger schemaVersion "${String(ledger.schemaVersion)}" for task ${event.taskId}; expected ${INTERVENTION_SCHEMA_VERSION}.`);
    }
    const duplicate = ledger.events.find((item) => item.eventId === event.eventId);
    if (duplicate) {
      persisted = duplicate;
      return ledger;
    }
    const previous = latestIntervention(ledger.events, event.interventionId);
    validateInterventionTransition(previous?.status, event.status, event.resolutionEvidence);
    persisted = { ...event, sequence: ledger.events.length + 1 };
    ledger.events.push(persisted);
    ledger.revision += 1;
    return ledger;
  });
  return persisted;
}

export function transitionIntervention(root: string, input: NewInterventionEvent): InterventionEvent {
  return appendInterventionEvent(root, input);
}

export function validateInterventionTransition(previous: InterventionStatus | undefined, next: InterventionStatus, evidence: ResolutionEvidence[] = []): void {
  if (next === "verified" && !evidence.some((item) => item.valid && item.currentWorkingTree && (item.kind === "command" || item.kind === "ci"))) {
    throw new Error("An intervention can become verified only with valid current-working-tree command or CI evidence.");
  }
  if (!previous) {
    if (["verified", "stale"].includes(next)) throw new Error(`Invalid initial intervention status: ${next}.`);
    return;
  }
  if (previous === next) return;
  if (previous === "prevented" && next === "repaired") {
    throw new Error("A prevented intervention cannot transition directly to repaired.");
  }
  const allowed: Record<InterventionStatus, InterventionStatus[]> = {
    observed: ["prevented", "requested", "repaired", "unresolved", "human-review"],
    prevented: ["requested", "unresolved", "human-review", "stale"],
    requested: ["repaired", "unresolved", "human-review", "stale"],
    repaired: ["verified", "unresolved", "human-review", "stale"],
    verified: ["stale"],
    unresolved: ["requested", "repaired", "human-review", "stale"],
    "human-review": ["requested", "repaired", "unresolved", "stale"],
    stale: ["observed", "requested", "repaired", "unresolved", "human-review"]
  };
  if (!allowed[previous].includes(next)) throw new Error(`Invalid intervention status transition: ${previous} -> ${next}.`);
}

export function listInterventionEvents(root: string, taskId: string): InterventionEvent[] {
  return readInterventionLedger(root, taskId)?.events ?? [];
}

export function findInterventions(root: string, taskId: string, ref: string): InterventionEvent[] {
  return listInterventionEvents(root, taskId).filter((event) =>
    event.interventionId === ref ||
    event.findingId === ref ||
    event.eventId === ref ||
    event.evidenceRefs.includes(ref) ||
    (event.traceRefs ?? []).includes(ref) ||
    (event.decisionRefs ?? []).includes(ref)
  );
}

export function summarizeInterventions(events: InterventionEvent[]): InterventionSummary {
  const statuses: InterventionStatus[] = ["observed", "prevented", "requested", "repaired", "verified", "unresolved", "human-review", "stale"];
  const byStatus = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<InterventionStatus, number>;
  const latest = new Map<string, InterventionEvent>();
  for (const event of events) {
    byStatus[event.status] += 1;
    const existing = latest.get(event.interventionId);
    if (!existing || (event.sequence ?? 0) > (existing.sequence ?? 0)) latest.set(event.interventionId, event);
  }
  const active = [...latest.values()].filter((event) => !["verified", "stale"].includes(event.status)).sort(compareEvents);
  const verified = [...latest.values()].filter((event) => event.status === "verified").sort(compareEvents);
  return { total: events.length, byStatus, active, verified };
}

function latestIntervention(events: InterventionEvent[], interventionId: string): InterventionEvent | undefined {
  return events.filter((event) => event.interventionId === interventionId).sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))[0];
}

function compareEvents(a: InterventionEvent, b: InterventionEvent): number {
  return a.interventionId.localeCompare(b.interventionId) || (a.sequence ?? 0) - (b.sequence ?? 0);
}

function safeLedgerId(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return clean || digest(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
