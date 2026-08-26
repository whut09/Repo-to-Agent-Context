import assert from "node:assert/strict";
import test from "node:test";
import { createContextFeedback, CONTEXT_FEEDBACK_LABELS, CONTEXT_FEEDBACK_TARGETS } from "../src/context-registry/feedback.js";

test("feedback supports every label and target without task or content fields", () => {
  for (const label of CONTEXT_FEEDBACK_LABELS) {
    for (const target of CONTEXT_FEEDBACK_TARGETS) {
      const feedback = createContextFeedback({
        repository: "C:/work/project",
        entryId: "official/payments",
        source: "official",
        version: "2.0.0",
        revision: 3,
        target,
        file: target === "file" ? "references/errors.md" : undefined,
        retrievalId: target === "retrieval-result" ? "retrieval-1" : undefined,
        interventionId: target === "intervention" ? "intervention-1" : undefined,
        label,
        now: new Date("2026-08-26T00:00:00.000Z")
      });
      assert.equal(feedback.label, label);
      assert.equal(feedback.target, target);
      assert.equal("task" in feedback, false);
      assert.equal("content" in feedback, false);
      assert.equal("sourceCode" in feedback, false);
    }
  }
});

test("feedback rejects absolute, traversal, and secret-like metadata", () => {
  const base = {
    repository: "C:/work/project",
    entryId: "official/payments",
    source: "official",
    revision: 1,
    target: "file" as const,
    label: "useful" as const
  };
  assert.throws(() => createContextFeedback({ ...base, file: "C:/Users/wzh/private.md" }), /repository-relative/i);
  assert.throws(() => createContextFeedback({ ...base, file: "../private.md" }), /traversal/i);
  assert.throws(() => createContextFeedback({ ...base, file: "references\\errors.md" }), /repository-relative/i);
  assert.throws(() => createContextFeedback({ ...base, source: "apiKey=do-not-store" }), /secret/i);
});

test("feedback identifiers are deterministic for the same metadata", () => {
  const input = {
    repository: "C:/work/project",
    entryId: "official/payments",
    source: "official",
    version: "2.0.0",
    revision: 1,
    target: "entry" as const,
    label: "useful" as const
  };
  assert.equal(createContextFeedback(input).feedbackId, createContextFeedback(input).feedbackId);
});
