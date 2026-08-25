import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addContextAnnotation,
  clearContextAnnotations,
  contextAnnotationStorePath,
  listContextAnnotations,
  readContextAnnotation
} from "../src/context-registry/annotations.js";

test("annotations support add, list, read, and clear with availability-only listing", () => {
  const repository = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-annotations-"));
  try {
    const annotation = addContextAnnotation({
      repository,
      entryId: "official/payments",
      packageVersion: "2.0.0",
      contentRevision: 3,
      kind: "workaround",
      note: "Use the retry policy for the legacy gateway.",
      now: new Date("2026-01-01T00:00:00.000Z")
    });
    assert.equal(existsSync(contextAnnotationStorePath(repository)), true);
    const listed = listContextAnnotations({ repository, entryId: "official/payments", packageVersion: "2.0.0", contentRevision: 3 });
    assert.equal(listed.annotationAvailable, true);
    assert.equal(listed.staleCount, 0);
    assert.equal("note" in listed.annotations[0]!, false);
    const read = readContextAnnotation({ repository, entryId: "official/payments", packageVersion: "2.0.0", contentRevision: 3, id: annotation.id });
    assert.equal(read.annotation.note, "Use the retry policy for the legacy gateway.");
    assert.equal(clearContextAnnotations({ repository, entryId: "official/payments", packageVersion: "2.0.0", contentRevision: 3, id: annotation.id }), 1);
    assert.equal(listContextAnnotations({ repository, entryId: "official/payments", packageVersion: "2.0.0", contentRevision: 3 }).annotationAvailable, false);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
