import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
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
import { buildLocalContextPack } from "../src/context-registry/index.js";

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

test("frontmatter parses Context Hub document and skill forms", async () => {
  const { parseContextFrontmatter } = await import("../src/context-registry/frontmatter.js");
  const doc = parseContextFrontmatter(
    `---\nname: payments\ndescription: Payment API\nmetadata:\n  languages: [typescript, python]\n  versions: "2.0.0, 1.0.0"\n  revision: 4\n  updated-on: 2026-02-03\n  source: maintainer\n  tags: payments, api, payments\n---\nUse the API safely.\n`,
    "DOC.md"
  );
  assert.equal(doc.valid, true);
  assert.deepEqual(doc.value?.frontmatter.languages, ["python", "typescript"]);
  assert.deepEqual(doc.value?.frontmatter.versions, ["1.0.0", "2.0.0"]);
  assert.deepEqual(doc.value?.frontmatter.tags, ["api", "payments"]);

  const skill = parseContextFrontmatter(
    `---\nname: deploy\ndescription: Deployment skill\nmetadata:\n  revision: 1\n  updated-on: 2026-02-03\n  source: community\n---\nRun the deployment checks.\n`,
    "SKILL.md"
  );
  assert.equal(skill.valid, true);
  assert.equal(skill.value?.frontmatter.kind, "skill");
});

test("frontmatter reports missing metadata with precise diagnostics", async () => {
  const { parseContextFrontmatter } = await import("../src/context-registry/frontmatter.js");
  const result = parseContextFrontmatter("---\nname: broken\n---\ncontent\n", "DOC.md");
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path.endsWith("metadata")));
});

test("frontmatter identifies skill files at root and Windows paths", async () => {
  const { kindFromPath } = await import("../src/context-registry/frontmatter.js");
  assert.equal(kindFromPath("SKILL.md"), "skill");
  assert.equal(kindFromPath("skills\\deploy\\SKILL.md"), "skill");
  assert.equal(kindFromPath("docs/DOC.md"), "doc");
});

test("local builder expands language and package version variants with companion files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-pack-"));
  try {
    const entryRoot = path.join(root, "acme", "docs", "payments", "v2");
    mkdirSync(path.join(entryRoot, "references"), { recursive: true });
    writeFileSync(
      path.join(entryRoot, "DOC.md"),
      `---\nname: payments\ndescription: Payment API\nmetadata:\n  languages: [typescript, python]\n  versions: [2.0.0]\n  revision: 3\n  updated-on: 2026-02-03\n  source: official\n  tags: payments, api\n---\nUse the payment API.\n`
    );
    writeFileSync(path.join(entryRoot, "references", "errors.md"), "Error reference\n");
    const result = buildLocalContextPack({
      source: { name: "acme", kind: "local", location: root, trustLevel: "official" },
      validateOnly: true,
      generatedAt: timestamp
    });
    assert.equal(result.valid, true);
    assert.equal(result.validateOnly, true);
    assert.equal(result.pack?.entries.length, 2);
    assert.deepEqual(
      result.pack?.entries.map((entry) => entry.language),
      ["python", "typescript"]
    );
    assert.ok(result.pack?.entries.every((entry) => entry.files.some((file) => file.path.endsWith("references/errors.md"))));
    assert.equal(existsSync(path.join(root, ".agent-context")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("companion paths cannot escape a local source", async () => {
  const { resolveContextFile } = await import("../src/context-registry/path-resolver.js");
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-path-"));
  try {
    assert.equal(resolveContextFile(root, "../secret.md").valid, false);
    assert.equal(resolveContextFile(root, "C:/secret.md").valid, false);
    assert.equal(resolveContextFile(root, "references/../secret.md").valid, false);
    const outside = path.join(path.dirname(root), "outside-context-file.md");
    writeFileSync(outside, "outside\n");
    try {
      symlinkSync(outside, path.join(root, "escape.md"));
      assert.equal(resolveContextFile(root, "escape.md").valid, false);
    } catch (error) {
      assert.ok((error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "EACCES");
    } finally {
      rmSync(outside, { force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid local content returns diagnostics without writing runtime state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-invalid-"));
  try {
    const entryRoot = path.join(root, "entry");
    mkdirSync(entryRoot, { recursive: true });
    writeFileSync(path.join(entryRoot, "DOC.md"), "---\nname: invalid\nmetadata: [wrong]\n---\nbody\n");
    const result = buildLocalContextPack({
      source: { name: "local", kind: "local", location: root, trustLevel: "private" },
      validateOnly: true
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "type" || issue.code === "required"));
    assert.equal(existsSync(path.join(root, ".agent-context")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
