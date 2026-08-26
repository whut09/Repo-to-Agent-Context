import assert from "node:assert/strict";
import test from "node:test";
import { buildContextFeedbackStats, buildContextFeedbackStatsByEntry, localQualitySignal } from "../src/context-registry/feedback-stats.js";
import type { ContextFeedback } from "../src/context-registry/types.js";

const feedback = (input: Partial<ContextFeedback>): ContextFeedback => ({
  schemaVersion: 1,
  feedbackId: input.feedbackId ?? "id",
  createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
  target: input.target ?? "entry",
  entryId: input.entryId ?? "official/payments",
  source: input.source ?? "official",
  version: "2.0.0",
  revision: 1,
  label: input.label ?? "useful"
});

test("feedback statistics aggregate labels without changing source records", () => {
  const values = [
    feedback({ feedbackId: "a", label: "useful" }),
    feedback({ feedbackId: "b", label: "outdated", createdAt: "2026-01-02T00:00:00.000Z" }),
    feedback({ feedbackId: "c", label: "useful", entryId: "community/payments" })
  ];
  const stats = buildContextFeedbackStats(values, { entryId: "official/payments", source: "official" });
  assert.equal(stats.total, 2);
  assert.equal(stats.labels.find((item) => item.label === "useful")?.count, 1);
  assert.equal(stats.labels.find((item) => item.label === "outdated")?.count, 1);
  assert.equal(stats.latestAt, "2026-01-02T00:00:00.000Z");
  assert.equal(localQualitySignal(stats), 0);
  assert.equal(buildContextFeedbackStatsByEntry(values).length, 2);
});

test("empty feedback has a neutral quality signal", () => {
  const stats = buildContextFeedbackStats([]);
  assert.equal(stats.total, 0);
  assert.equal(localQualitySignal(stats), 0);
});
