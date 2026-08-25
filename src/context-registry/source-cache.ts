import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readJsonDiagnostic, writeJsonAtomicWithRevision } from "../core/atomic-store.js";
import { hashContextValue } from "./hash.js";
import { validateContextPack } from "./validators.js";
import type { ContextPack, ContextSourceCacheMetadata, ContextSourceConfig } from "./types.js";

export interface CachedContextSource {
  schemaVersion: 1;
  revision: number;
  metadata: ContextSourceCacheMetadata;
  pack: ContextPack;
}

export type SourceCacheReadResult =
  | { status: "hit"; value: CachedContextSource; stale: boolean }
  | { status: "missing"; filePath: string }
  | { status: "corrupt"; filePath: string; error: string };

export function sourceCachePath(root: string, source: Pick<ContextSourceConfig, "name" | "location">): string {
  const safeName = source.name.replace(/[^a-z0-9._-]+/gi, "_");
  const identity = createHash("sha256").update(source.name, "utf8").digest("hex").slice(0, 16);
  return path.join(path.resolve(root), ".agent-context", "cache", "context-registry", `${safeName}-${identity}.json`);
}

export function readSourceCache(root: string, source: Pick<ContextSourceConfig, "name" | "location">, now = new Date()): SourceCacheReadResult {
  const filePath = sourceCachePath(root, source);
  const result = readJsonDiagnostic<CachedContextSource>(filePath);
  if (result.status !== "ok") return result;
  const value = result.value;
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 || typeof value.revision !== "number" || !value.metadata || !value.pack) {
    return { status: "corrupt", filePath, error: "source cache must contain metadata and pack" };
  }
  if (value.metadata.schemaVersion !== 1 || !Number.isInteger(value.metadata.revision) || value.metadata.revision < 0) {
    return { status: "corrupt", filePath, error: "source cache metadata has an unsupported schemaVersion or revision" };
  }
  if (!/^[a-f0-9]{64}$/i.test(value.metadata.registryHash) || !/^[a-f0-9]{64}$/i.test(value.metadata.contentHash)) {
    return { status: "corrupt", filePath, error: "source cache metadata hashes must be SHA-256 hex digests" };
  }
  const packResult = validateContextPack(value.pack);
  if (!packResult.valid) {
    return { status: "corrupt", filePath, error: packResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ") };
  }
  if (value.metadata.sourceName !== source.name) {
    return { status: "corrupt", filePath, error: `source cache belongs to ${value.metadata.sourceName}, not ${source.name}` };
  }
  if (value.metadata.sourceLocation !== source.location) {
    return { status: "corrupt", filePath, error: `source cache location changed from ${value.metadata.sourceLocation} to ${source.location}` };
  }
  const computedContentHash = hashContextValue(packResult.value);
  if (value.metadata.contentHash !== computedContentHash) {
    return { status: "corrupt", filePath, error: `source cache contentHash mismatch: expected ${computedContentHash}, received ${value.metadata.contentHash}` };
  }
  if (value.metadata.registryHash !== packResult.value!.contentHash) {
    return {
      status: "corrupt",
      filePath,
      error: `source cache registryHash mismatch: expected ${packResult.value!.contentHash}, received ${value.metadata.registryHash}`
    };
  }
  const expiresAt = value.metadata.expiresAt ? Date.parse(value.metadata.expiresAt) : NaN;
  return { status: "hit", value: { ...value, pack: packResult.value! }, stale: Number.isFinite(expiresAt) && expiresAt <= now.getTime() };
}

export function writeSourceCache(root: string, source: ContextSourceConfig, pack: ContextPack, fetchedAt = new Date()): CachedContextSource {
  const validated = validateContextPack(pack);
  if (!validated.valid) throw new Error(validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  const contentHash = hashContextValue(validated.value);
  const registryHash = validated.value!.contentHash;
  const ttl = source.cacheTtlMs;
  const value: CachedContextSource = {
    schemaVersion: 1,
    revision: 0,
    metadata: {
      schemaVersion: 1,
      revision: 0,
      sourceName: source.name,
      sourceLocation: source.location,
      registryHash,
      fetchedAt: fetchedAt.toISOString(),
      contentHash,
      ...(ttl ? { expiresAt: new Date(fetchedAt.getTime() + ttl).toISOString() } : {})
    },
    pack: validated.value!
  };
  const filePath = sourceCachePath(root, source);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const current = readJsonDiagnostic<CachedContextSource>(filePath);
  if (current.status === "corrupt") throw new Error(`Unable to update corrupt source cache ${filePath}: ${current.error}`);
  const expectedRevision = current.status === "ok" && typeof current.value.revision === "number" ? current.value.revision : 0;
  value.metadata.revision = expectedRevision + 1;
  const next = writeJsonAtomicWithRevision(filePath, value, expectedRevision);
  const stored = next as CachedContextSource;
  return { ...stored, metadata: { ...stored.metadata, revision: stored.revision } };
}

export function isSourceCacheUsable(result: SourceCacheReadResult): result is Extract<SourceCacheReadResult, { status: "hit" }> {
  return result.status === "hit" && !result.stale;
}
