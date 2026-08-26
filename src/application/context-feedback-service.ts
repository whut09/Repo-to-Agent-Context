import { loadConfig } from "../config/load-config.js";
import { buildContextFeedbackStats, buildContextFeedbackStatsByEntry, localQualitySignal } from "../context-registry/feedback-stats.js";
import { recordContextFeedback, readContextFeedback } from "../context-registry/feedback-store.js";
import { submitContextFeedback, type ContextFeedbackTransportResult } from "../context-registry/feedback-transport.js";
import type { CreateContextFeedbackInput } from "../context-registry/feedback.js";
import type { ContextFeedback, ContextFeedbackStats } from "../context-registry/types.js";

export interface SubmitApplicationContextFeedbackInput extends Omit<CreateContextFeedbackInput, "repository"> {
  repo: string;
}

export interface ApplicationContextFeedbackResult {
  enabled: boolean;
  feedback?: ContextFeedback;
  stats: ContextFeedbackStats;
  transport: ContextFeedbackTransportResult;
}

export async function submitApplicationContextFeedback(input: SubmitApplicationContextFeedbackInput): Promise<ApplicationContextFeedbackResult> {
  const root = input.repo;
  const config = loadConfig(root).feedback;
  if (!config.enabled) {
    return { enabled: false, stats: buildContextFeedbackStats([]), transport: { status: "disabled" } };
  }
  const feedback = recordContextFeedback({ ...input, repository: root });
  const stats = buildContextFeedbackStats(readContextFeedback(root), { entryId: feedback.entryId, source: feedback.source });
  const transport = await submitContextFeedback(feedback, config);
  return { enabled: true, feedback, stats, transport };
}

export function readApplicationContextFeedbackStats(repo: string, entryId?: string, source?: string): ContextFeedbackStats {
  return buildContextFeedbackStats(readContextFeedback(repo), { entryId, source });
}

export function readApplicationContextQualitySignals(repo: string): Record<string, number> {
  return Object.fromEntries(
    buildContextFeedbackStatsByEntry(readContextFeedback(repo)).map((stats) => [`${stats.source}\0${stats.entryId}`, localQualitySignal(stats) * 3])
  );
}
