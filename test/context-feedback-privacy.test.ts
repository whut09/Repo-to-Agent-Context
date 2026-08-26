import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { submitApplicationContextFeedback } from "../src/application/context-feedback-service.js";
import { addContextAnnotation, contextAnnotationStorePath } from "../src/context-registry/annotations.js";
import { contextFeedbackStorePath } from "../src/context-registry/feedback-store.js";

test("feedback persistence drops task, source content, absolute paths, and secret extras", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-feedback-privacy-"));
  try {
    await submitApplicationContextFeedback({
      repo: root,
      entryId: "official/auth",
      source: "official",
      revision: 1,
      target: "entry",
      label: "useful",
      task: "private customer incident",
      sourceCode: "export const secret = 'do-not-store';",
      absolutePath: "C:/Users/example/private/project.ts",
      apiKey: "sk_do_not_store_1234567890"
    } as Parameters<typeof submitApplicationContextFeedback>[0]);
    const stored = readFileSync(contextFeedbackStorePath(root), "utf8");
    for (const forbidden of ["private customer incident", "export const secret", "C:/Users/example", "sk_do_not_store"]) {
      assert.equal(stored.includes(forbidden), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local annotations and maintainer feedback stay in separate stores", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-feedback-annotation-"));
  try {
    addContextAnnotation({ repository: root, entryId: "official/auth", contentRevision: 1, kind: "workaround", note: "Local workaround only." });
    await submitApplicationContextFeedback({ repo: root, entryId: "official/auth", source: "official", revision: 1, target: "entry", label: "outdated" });
    const annotationStore = readFileSync(contextAnnotationStorePath(root), "utf8");
    const feedbackStore = readFileSync(contextFeedbackStorePath(root), "utf8");
    assert.match(annotationStore, /Local workaround only/);
    assert.equal(feedbackStore.includes("Local workaround only"), false);
    assert.match(feedbackStore, /outdated/);
    assert.equal(annotationStore.includes("outdated"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
