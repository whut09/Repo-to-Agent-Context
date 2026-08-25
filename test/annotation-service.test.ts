import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addApplicationAnnotation,
  clearApplicationAnnotations,
  injectApplicationAnnotation,
  listApplicationAnnotations,
  readApplicationAnnotation
} from "../src/application/annotation-service.js";

test("application annotation service exposes lifecycle and explicit injection", () => {
  const repository = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-annotation-service-"));
  try {
    const input = { repository, entryId: "entry", packageVersion: "1.0.0", contentRevision: 1, kind: "convention" as const, note: "Keep API errors typed." };
    const annotation = addApplicationAnnotation(input);
    assert.equal(listApplicationAnnotations(input).annotationAvailable, true);
    assert.equal(readApplicationAnnotation({ ...input, id: annotation.id }).annotation.note, input.note);
    const injected = injectApplicationAnnotation({ ...input, id: annotation.id });
    assert.equal(injected.injection.commandAuthority, false);
    assert.equal(injected.injection.evidenceAuthority, false);
    assert.equal(clearApplicationAnnotations({ ...input, id: annotation.id }), 1);
    assert.equal(listApplicationAnnotations(input).annotationAvailable, false);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
