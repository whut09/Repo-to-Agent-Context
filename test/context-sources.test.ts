import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONTEXT_REGISTRY_SCHEMA_VERSION,
  fetchRemoteContextPack,
  hashContextText,
  loadContextSourceRegistry,
  mergeContextPacks,
  readSourceCache,
  readContextRegistrySnapshot,
  sourceCachePath,
  writeContextRegistrySnapshot,
  writeSourceCache,
  type ContextEntry,
  type ContextPack,
  type ContextSourceConfig
} from "../src/context-registry/index.js";

const timestamp = "2026-01-01T00:00:00.000Z";

function entry(sourceName: string, id = "payments"): ContextEntry {
  const contentHash = hashContextText(`${sourceName}:${id}`);
  return {
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    id,
    canonicalId: "payments",
    name: "payments",
    description: `${sourceName} payments API`,
    kind: "doc",
    tags: ["api"],
    language: "typescript",
    packageVersion: "1.0.0",
    contentRevision: 1,
    updatedAt: timestamp,
    sourceName,
    trustLevel: sourceName === "official" ? "official" : "community",
    files: [],
    contentHash,
    provenance: {
      schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
      revision: 0,
      sourceName,
      sourceTrustLevel: sourceName === "official" ? "official" : "community",
      entryId: id,
      packageVersion: "1.0.0",
      contentRevision: 1,
      contentHash,
      verified: false
    }
  };
}

function pack(sourceName: string): ContextPack {
  const entries = [entry(sourceName)];
  return {
    schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
    revision: 0,
    id: `${sourceName}/context-pack`,
    sourceName,
    generatedAt: timestamp,
    entries,
    contentHash: hashContextText(JSON.stringify(entries))
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function remoteSource(name: string, value: unknown, overrides: Partial<ContextSourceConfig> = {}): ContextSourceConfig {
  return {
    name,
    kind: "remote",
    location: "https://example.test/registry.json",
    trustLevel: "official",
    sha256: hashContextText(JSON.stringify(value)),
    ...overrides
  };
}

test("source merge preserves source-prefixed conflicts and trust ordering", () => {
  const result = mergeContextPacks([pack("community"), pack("official")]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.value?.conflicts[0]?.sourceNames, ["community", "official"]);
  assert.deepEqual(
    result.value?.entries.map((item) => item.id),
    ["official:payments", "community:payments"]
  );
  assert.equal(result.value?.entries[0]?.trustLevel, "official");
});

test("remote sources remain offline by default and do not call fetch", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-source-offline-"));
  let calls = 0;
  try {
    const source: ContextSourceConfig = remoteSource("public", pack("public"));
    const result = await loadContextSourceRegistry({
      root,
      sources: [source],
      fetch: async () => {
        calls += 1;
        return jsonResponse(pack("public"));
      }
    });
    assert.equal(calls, 0);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.message.includes("offline")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("remote source fetches, caches, and falls back while offline", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-source-cache-"));
  const source: ContextSourceConfig = remoteSource("public", pack("public"));
  let calls = 0;
  try {
    const online = await loadContextSourceRegistry({
      root,
      sources: [source],
      offline: false,
      fetch: async () => {
        calls += 1;
        return jsonResponse(pack("public"));
      }
    });
    assert.equal(online.valid, true);
    assert.equal(online.sources[0]?.cache.status, "miss");
    assert.equal(calls, 1);
    const offline = await loadContextSourceRegistry({
      root,
      sources: [source],
      offline: true,
      fetch: async () => {
        calls += 1;
        return jsonResponse(pack("public"));
      }
    });
    assert.equal(offline.valid, true);
    assert.equal(offline.sources[0]?.cache.status, "hit");
    assert.equal(offline.sources[0]?.cache.fallback, false);
    assert.equal(calls, 1);

    const disconnected = await loadContextSourceRegistry({
      root,
      sources: [source],
      offline: false,
      fetch: async () => {
        throw new Error("network down");
      }
    });
    assert.equal(disconnected.valid, true);
    assert.equal(disconnected.sources[0]?.cache.fallback, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale cache is reported and remote content is still never treated as fresh", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-source-stale-"));
  const source: ContextSourceConfig = remoteSource("public", pack("public"), { cacheTtlMs: 1 });
  try {
    await loadContextSourceRegistry({ root, sources: [source], offline: false, fetch: async () => jsonResponse(pack("public")) });
    const result = await loadContextSourceRegistry({ root, sources: [source], offline: true, now: new Date(Date.now() + 10_000) });
    assert.equal(result.valid, true);
    assert.equal(result.sources[0]?.cache.stale, true);
    assert.equal(result.snapshot?.cache[0]?.stale, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("remote content hash, size, and schema are verified before caching", async () => {
  const source: ContextSourceConfig = remoteSource("public", pack("public"), { maxBytes: 10 });
  await assert.rejects(() => fetchRemoteContextPack(source, { fetch: async () => jsonResponse(pack("public")) }), /exceeds 10 bytes/);
  const content = JSON.stringify(pack("public"));
  const hashSource = { ...source, maxBytes: 100_000, sha256: "0".repeat(64) };
  await assert.rejects(() => fetchRemoteContextPack(hashSource, { fetch: async () => jsonResponse(pack("public")) }), /SHA-256 mismatch/);
  const invalid = { bad: true };
  const invalidSource = remoteSource("public", invalid, { maxBytes: 100_000 });
  await assert.rejects(() => fetchRemoteContextPack(invalidSource, { fetch: async () => jsonResponse(invalid) }), /schema/);
  assert.equal(hashContextText(content).length, 64);
});

test("remote fetch timeout aborts a hanging response", async () => {
  const source: ContextSourceConfig = {
    name: "slow",
    kind: "remote",
    location: "https://example.test/slow.json",
    trustLevel: "community",
    sha256: "0".repeat(64),
    timeoutMs: 5
  };
  await assert.rejects(
    () =>
      fetchRemoteContextPack(source, {
        fetch: async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          })
      }),
    /timeout|request exceeded/
  );
});

test("remote fetch rejects an unsigned source before network access", async () => {
  const source: ContextSourceConfig = {
    name: "unsigned",
    kind: "remote",
    location: "https://example.test/unsigned.json",
    trustLevel: "community"
  };
  await assert.rejects(() => fetchRemoteContextPack(source, { fetch: async () => jsonResponse(pack("unsigned")) }), /require a configured sha256/);
});

test("corrupt source cache is diagnostic and cannot be replaced silently", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-source-corrupt-"));
  const source: ContextSourceConfig = { name: "中文 source", kind: "remote", location: "https://example.test/registry.json", trustLevel: "private" };
  try {
    const cachePath = sourceCachePath(root, source);
    mkdirSync(path.dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, "{broken", "utf8");
    const result = readSourceCache(root, source);
    assert.equal(result.status, "corrupt");
    assert.throws(() => writeSourceCache(root, source, pack("中文 source")), /Unable to update corrupt source cache/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("merged registry snapshots use atomic revision storage and diagnose corruption", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-registry-snapshot-"));
  const source = remoteSource("public", pack("public"));
  try {
    const loaded = await loadContextSourceRegistry({ root, sources: [source], offline: false, fetch: async () => jsonResponse(pack("public")) });
    const snapshot = loaded.snapshot!;
    const first = writeContextRegistrySnapshot(root, snapshot);
    assert.equal(first.revision, 1);
    assert.equal(readContextRegistrySnapshot(root).status, "ok");
    assert.throws(() => writeContextRegistrySnapshot(root, snapshot, 0), /Revision conflict/);
    const snapshotPath = path.join(root, ".agent-context", "cache", "context-registry", "snapshot.json");
    writeFileSync(snapshotPath, "{broken", "utf8");
    assert.equal(readContextRegistrySnapshot(root).status, "corrupt");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
