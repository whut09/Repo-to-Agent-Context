import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { contextFeedbackStorePath, readContextFeedback, recordContextFeedback } from "../src/context-registry/feedback-store.js";

test("feedback is stored atomically and duplicate metadata is idempotent", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-feedback-store-"));
  try {
    const input = {
      repository: root,
      entryId: "official/payments",
      source: "official",
      version: "2.0.0",
      revision: 4,
      target: "entry" as const,
      label: "useful" as const
    };
    const first = recordContextFeedback(input);
    const second = recordContextFeedback(input);
    assert.equal(second.feedbackId, first.feedbackId);
    assert.equal(readContextFeedback(root).length, 1);
    assert.equal(existsSync(contextFeedbackStorePath(root)), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corrupt feedback store is diagnosed instead of becoming empty", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-feedback-corrupt-"));
  try {
    const filePath = contextFeedbackStorePath(root);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "{broken", "utf8");
    assert.throws(() => readContextFeedback(root), /Unable to read Context feedback store/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
