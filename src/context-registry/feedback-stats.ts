import { CONTEXT_FEEDBACK_LABELS } from "./feedback.js";
import type { ContextFeedback, ContextFeedbackStats } from "./types.js";

export interface ContextFeedbackStatsFilter {
  entryId?: string;
  source?: string;
}

export function buildContextFeedbackStats(feedback: readonly ContextFeedback[], filter: ContextFeedbackStatsFilter = {}): ContextFeedbackStats {
  const selected = feedback.filter((item) => (!filter.entryId || item.entryId === filter.entryId) && (!filter.source || item.source === filter.source));
  const counts = new Map<ContextFeedback["label"], number>(selected.map((item) => [item.label, 0]));
  for (const item of selected) counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
  const latestAt = selected.reduce<string | undefined>((latest, item) => (!latest || item.createdAt > latest ? item.createdAt : latest), undefined);
  return {
    ...(filter.entryId ? { entryId: filter.entryId } : {}),
    ...(filter.source ? { source: filter.source } : {}),
    total: selected.length,
    labels: CONTEXT_FEEDBACK_LABELS.map((label) => ({ label, count: counts.get(label) ?? 0 })),
    ...(latestAt ? { latestAt } : {})
  };
}

export function buildContextFeedbackStatsByEntry(feedback: readonly ContextFeedback[]): ContextFeedbackStats[] {
  const keys = [...new Set(feedback.map((item) => `${item.source}\0${item.entryId}`))].sort((left, right) => left.localeCompare(right));
  return keys.map((key) => {
    const [source, entryId] = key.split("\0");
    return buildContextFeedbackStats(feedback, { source, entryId });
  });
}

export function localQualitySignal(stats: ContextFeedbackStats): number {
  if (!stats.total) return 0;
  const positive = stats.labels.find((item) => item.label === "useful")?.count ?? 0;
  const negative = stats.labels
    .filter((item) => item.label !== "useful")
    .reduce((sum, item) => sum + item.count, 0);
  return (positive - negative) / stats.total;
}
