import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { buildContextFeedbackStats } from "../context-registry/feedback-stats.js";
import { readContextFeedback } from "../context-registry/feedback-store.js";
import { readContextUsage } from "../context-registry/usage-ledger.js";
import { interventionLedgerJsonlPath, listInterventionEvents, summarizeInterventions } from "../harness/observability/intervention-ledger.js";
import type { ContextAdviceDecision, ContextFeedbackStats } from "../context-registry/types.js";
import type { InterventionEvent, InterventionSummary } from "../harness/types.js";

export interface ApplicationInterventionResult {
  taskId: string;
  ledgerPath: string;
  events: InterventionEvent[];
  summary: InterventionSummary;
  context: {
    selectedFiles: string[];
    rejectedFiles: string[];
    help: string[];
    adoptedAdvice: ContextAdviceDecision[];
    rejectedAdvice: ContextAdviceDecision[];
  };
  feedback: {
    stats: ContextFeedbackStats;
    localOnly: boolean;
    networkEnabled: boolean;
    annotationSeparate: true;
    evidenceAuthority: false;
  };
}

export function getApplicationInterventions(repo: string, taskId: string): ApplicationInterventionResult {
  const root = path.resolve(repo);
  const events = listInterventionEvents(root, taskId);
  const usages = readContextUsage(root, taskId);
  const advice = usages.flatMap((record) => record.advice);
  const config = loadConfig(root).feedback;
  return {
    taskId,
    ledgerPath: path.relative(root, interventionLedgerJsonlPath(root, taskId)).replaceAll("\\", "/"),
    events,
    summary: summarizeInterventions(events),
    context: {
      selectedFiles: unique(usages.flatMap((record) => record.selectedFiles)),
      rejectedFiles: unique(usages.flatMap((record) => record.omittedFiles)),
      help: unique(usages.flatMap((record) => record.selectedFiles.map((file) => `${record.entryId} located ${file}.`))),
      adoptedAdvice: uniqueAdvice(advice.filter((item) => item.disposition === "adopted")),
      rejectedAdvice: uniqueAdvice(advice.filter((item) => item.disposition === "rejected"))
    },
    feedback: {
      stats: buildContextFeedbackStats(readContextFeedback(root)),
      localOnly: !config.network || !config.telemetry,
      networkEnabled: config.network && config.telemetry,
      annotationSeparate: true,
      evidenceAuthority: false
    }
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueAdvice(values: ContextAdviceDecision[]): ContextAdviceDecision[] {
  return [...new Map(values.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id));
}
