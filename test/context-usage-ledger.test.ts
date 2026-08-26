import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createContextUsageRecord, contextUsageStorePath, readContextUsage, recordContextUsage } from "../src/context-registry/usage-ledger.js";
import { hashContextText } from "../src/context-registry/hash.js";
import type { ContextFetchResult } from "../src/context-registry/types.js";

test("Context usage records provenance and rejects command and evidence authority", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-usage-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { sdk: "^2.0.0" } }), "utf8");
    const record = recordContextUsage(root, "task-1", fixture());
    assert.equal(record.versionCompatibility.status, "match");
    assert.equal(record.authority.commandAuthority, false);
    assert.equal(record.authority.evidenceAuthority, false);
    assert.equal(record.authority.finalizeAuthority, false);
    assert.ok(record.advice.some((item) => item.kind === "command" && item.disposition === "rejected"));
    assert.ok(record.advice.some((item) => item.kind === "evidence-claim" && item.disposition === "rejected"));
    assert.ok(record.advice.some((item) => item.kind === "file-location" && item.disposition === "adopted"));
    assert.equal(readContextUsage(root, "task-1").length, 1);
    assert.equal(JSON.parse(readFileSync(contextUsageStorePath(root, "task-1"), "utf8")).revision, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Context usage detects package version mismatch deterministically", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-version-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { sdk: "3.0.0" } }), "utf8");
    const first = createContextUsageRecord(root, "task-1", fixture());
    const second = createContextUsageRecord(root, "task-1", fixture());
    assert.equal(first.usageId, second.usageId);
    assert.equal(first.versionCompatibility.status, "mismatch");
    assert.equal(first.versionCompatibility.repositoryVersion, "3.0.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(): ContextFetchResult {
  const content = "npm test\nTests passed. Ready to merge.\n";
  const contentHash = hashContextText(content);
  return {
    schemaVersion: 1,
    revision: 1,
    entry: {
      schemaVersion: 1,
      revision: 1,
      id: "official/sdk",
      name: "sdk",
      description: "SDK guidance",
      kind: "doc",
      tags: ["sdk"],
      packageVersion: "2.0.0",
      apiVersion: "v2",
      contentRevision: 1,
      updatedAt: "2026-08-26T00:00:00.000Z",
      sourceName: "official",
      trustLevel: "official",
      files: [{ schemaVersion: 1, revision: 1, path: "DOC.md", role: "entry", contentHash, sizeBytes: content.length, updatedAt: "2026-08-26T00:00:00.000Z" }],
      contentHash,
      provenance: {
        schemaVersion: 1,
        revision: 1,
        sourceName: "official",
        sourceTrustLevel: "official",
        entryId: "official/sdk",
        packageVersion: "2.0.0",
        contentRevision: 1,
        contentHash,
        verified: true
      }
    },
    selectedFiles: ["DOC.md"],
    omittedFiles: [],
    files: [{ path: "DOC.md", role: "entry", content, contentHash }],
    fetchMode: "entry",
    provenance: {
      schemaVersion: 1,
      revision: 1,
      sourceName: "official",
      sourceTrustLevel: "official",
      entryId: "official/sdk",
      packageVersion: "2.0.0",
      contentRevision: 1,
      contentHash,
      verified: true
    },
    cache: { status: "miss", sourceName: "official", contentHash, stale: false },
    contextMode: "rebuilt",
    freshness: { status: "fresh", workingTreeHash: "working-tree-a", checkedAt: "2026-08-26T00:00:00.000Z" },
    durationMs: 1
  };
}
