import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RevisionConflictError } from "../src/core/atomic-store.js";
import {
  CONTEXT_REGISTRY_SCHEMA_VERSION,
  hashContextText,
  hashContextValue,
  readContextPack,
  stableStringify,
  validateContextAnnotation,
  validateContextEntry,
  validateContextFetchResult,
  validateContextPack,
  validateContextSource,
  writeContextPack
} from "../src/context-registry/index.js";

const timestamp = "2026-01-01T00:00:00.000Z";
const contentHash = hashContextText("context");

function contextFile(pathName: string, role: "entry" | "reference" = "entry") {
  return {
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    path: pathName,
    role,
    contentHash,
    sizeBytes: 7,
    updatedAt: timestamp
  };
}

function contextEntry(id = "acme/api") {
  const provenance = {
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    sourceName: "local",
    sourceTrustLevel: "private" as const,
    entryId: id,
    packageVersion: "2.0.0",
    contentRevision: 3,
    contentHash,
    verified: false
  };
  return {
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    id,
    name: "api",
    description: "Private API reference",
    kind: "doc" as const,
    tags: ["api", "private", "api"],
    language: "typescript",
    packageVersion: "2.0.0",
    contentRevision: 3,
    updatedAt: timestamp,
    sourceName: "local",
    trustLevel: "private" as const,
    files: [contextFile("references/auth.md", "reference"), contextFile("DOC.md")],
    contentHash,
    provenance
  };
}

test("context registry serialization is stable across object key order", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
  assert.equal(hashContextValue({ b: 2, a: 1 }), hashContextValue({ a: 1, b: 2 }));
});

test("context entry validation preserves independent source and version identities", () => {
  const result = validateContextEntry(contextEntry());
  assert.equal(result.valid, true);
  assert.deepEqual(result.value?.tags, ["api", "private"]);
  assert.deepEqual(
    result.value?.files.map((file) => file.path),
    ["DOC.md", "references/auth.md"]
  );
  assert.equal(result.value?.sourceName, "local");
  assert.equal(result.value?.packageVersion, "2.0.0");
  assert.equal(result.value?.contentRevision, 3);
});

test("schema diagnostics identify unsafe file paths and unsupported versions", () => {
  const result = validateContextEntry({ ...contextEntry(), schemaVersion: 99, files: [contextFile("../secret.md")] });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "version"));
  assert.ok(result.issues.some((issue) => issue.path === "$.files[0].path"));
});

test("source validation requires explicit trust and location", () => {
  const result = validateContextSource({
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    name: "local",
    kind: "local",
    location: "C:/context",
    trustLevel: "private",
    enabled: true,
    updatedAt: timestamp
  });
  assert.equal(result.valid, true);
});

test("annotations are always untrusted and versioned", () => {
  const accepted = validateContextAnnotation({
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    id: "note-1",
    repository: "C:/repo",
    entryId: "acme/api",
    packageVersion: "2.0.0",
    contentRevision: 3,
    note: "Requires the raw request body.",
    trustLevel: "untrusted",
    createdAt: timestamp,
    updatedAt: timestamp
  });
  assert.equal(accepted.valid, true);
  const rejected = validateContextAnnotation({ ...accepted.value, trustLevel: "official" });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.issues.some((issue) => issue.path === "$.trustLevel"));
});

test("pack validation rejects duplicate entries and source mismatches", () => {
  const result = validateContextPack({
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    id: "pack-1",
    sourceName: "local",
    generatedAt: timestamp,
    entries: [contextEntry(), contextEntry()],
    contentHash
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.message.includes("unique")));
});

test("fetch result rejects selected and omitted file overlap", () => {
  const result = validateContextFetchResult({
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    entry: contextEntry(),
    selectedFiles: ["DOC.md"],
    omittedFiles: ["DOC.md"],
    provenance: contextEntry().provenance,
    cache: { status: "hit" },
    contextMode: "reused",
    durationMs: 2
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path === "$.selectedFiles"));
});

test("context packs use atomic storage and revision conflict detection", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-registry-"));
  try {
    const pack = {
      schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
      revision: 0,
      id: "pack-1",
      sourceName: "local",
      generatedAt: timestamp,
      entries: [contextEntry()],
      contentHash
    };
    const first = writeContextPack(root, pack);
    assert.equal(first.revision, 1);
    assert.equal(readContextPack(root).status, "ok");
    assert.throws(() => writeContextPack(root, pack, 0), RevisionConflictError);
    const second = writeContextPack(root, { ...pack, revision: first.revision }, first.revision);
    assert.equal(second.revision, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
