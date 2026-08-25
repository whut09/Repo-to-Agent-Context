import path from "node:path";
import { readJsonDiagnostic, writeJsonAtomicWithRevision } from "../core/atomic-store.js";
import { buildLocalContextPack } from "./registry-builder.js";
import { hashContextValue } from "./hash.js";
import { readSourceCache, writeSourceCache, type SourceCacheReadResult } from "./source-cache.js";
import { fetchRemoteContextPack, ContextSourceFetchError } from "./remote-source.js";
import { validResult, type ContextSchemaIssue, type ContextValidationResult } from "./schema.js";
import { validateContextEntry, validateContextSource } from "./validators.js";
import type {
  ContextEntry,
  ContextPack,
  ContextRegistryConflict,
  ContextRegistrySnapshot,
  ContextSource,
  ContextSourceConfig,
  ContextTrustLevel
} from "./types.js";

export interface ContextSourceRegistryOptions {
  root: string;
  sources: ContextSourceConfig[];
  offline?: boolean;
  now?: Date;
  fetch?: typeof globalThis.fetch;
}

export interface ContextSourceLoadResult {
  source: ContextSource;
  pack?: ContextPack;
  cache: {
    status: "hit" | "miss";
    stale: boolean;
    fallback: boolean;
    registryHash?: string;
    fetchedAt?: string;
    contentHash?: string;
  };
  issues: ContextSchemaIssue[];
}

export interface ContextSourceRegistryResult {
  valid: boolean;
  snapshot?: ContextRegistrySnapshot;
  sources: ContextSourceLoadResult[];
  issues: ContextSchemaIssue[];
}

export type ContextRegistrySnapshotReadResult =
  | { status: "ok"; value: ContextRegistrySnapshot }
  | { status: "missing"; filePath: string }
  | { status: "corrupt"; filePath: string; error: string };

const TRUST_RANK: Record<ContextTrustLevel, number> = {
  official: 5,
  maintainer: 4,
  private: 3,
  community: 2,
  untrusted: 1
};

export function contextRegistrySnapshotPath(root: string): string {
  return path.join(path.resolve(root), ".agent-context", "cache", "context-registry", "snapshot.json");
}

export function readContextRegistrySnapshot(root: string): ContextRegistrySnapshotReadResult {
  const filePath = contextRegistrySnapshotPath(root);
  const result = readJsonDiagnostic<ContextRegistrySnapshot>(filePath);
  if (result.status !== "ok") return result;
  const issues = validateSnapshot(result.value);
  if (issues.length) return { status: "corrupt", filePath, error: issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ") };
  return { status: "ok", value: result.value };
}

export function writeContextRegistrySnapshot(root: string, snapshot: ContextRegistrySnapshot, expectedRevision?: number): ContextRegistrySnapshot {
  const issues = validateSnapshot(snapshot);
  if (issues.length) throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  const filePath = contextRegistrySnapshotPath(root);
  const current = readContextRegistrySnapshot(root);
  const revision = expectedRevision ?? (current.status === "ok" ? current.value.revision : 0);
  return writeJsonAtomicWithRevision(filePath, snapshot, revision) as ContextRegistrySnapshot;
}

export async function loadContextSourceRegistry(options: ContextSourceRegistryOptions): Promise<ContextSourceRegistryResult> {
  const duplicateNames = findDuplicateSourceNames(options.sources);
  if (duplicateNames.length) {
    const issues = duplicateNames.map((name) => ({
      path: `sources.${name}`,
      code: "value" as const,
      message: "source names must be unique; refusing implicit override"
    }));
    return { valid: false, sources: [], issues };
  }
  const sourceResults: ContextSourceLoadResult[] = [];
  for (const source of [...options.sources].filter((item) => item.enabled !== false).sort(compareSourceConfig)) {
    sourceResults.push(await loadSource(options, source));
  }
  const issues = sourceResults.flatMap((result) => result.issues);
  const packs = sourceResults.filter((result): result is ContextSourceLoadResult & { pack: ContextPack } => result.pack !== undefined);
  if (!packs.length && issues.length) return { valid: false, sources: sourceResults, issues };
  const merged = mergePacks(packs.map((result) => result.pack));
  const sourceValues = sourceResults.map((result) => result.source);
  const snapshot: ContextRegistrySnapshot = {
    schemaVersion: 1,
    revision: 0,
    generatedAt: (options.now ?? new Date()).toISOString(),
    entries: merged.entries,
    sources: sourceValues,
    conflicts: merged.conflicts,
    cache: sourceResults.map((result) => ({
      status: result.cache.status,
      sourceName: result.source.name,
      sourceRegistryHash: result.cache.registryHash,
      fetchedAt: result.cache.fetchedAt,
      contentHash: result.cache.contentHash,
      stale: result.cache.stale,
      fallback: result.cache.fallback
    })),
    registryHash: hashContextValue(merged.entries)
  };
  return { valid: issues.length === 0, snapshot, sources: sourceResults, issues };
}

export function mergeContextPacks(packs: ContextPack[]): ContextValidationResult<ContextRegistrySnapshot> {
  const result = mergePacks(packs);
  const entries = result.entries;
  const sources = [...new Map(packs.map((pack) => [pack.sourceName, createSourceFromPack(pack)])).values()].sort(compareSources);
  return validResult({
    schemaVersion: 1,
    revision: 0,
    generatedAt: new Date(0).toISOString(),
    entries,
    sources,
    conflicts: result.conflicts,
    cache: [],
    registryHash: hashContextValue(entries)
  });
}

export function rankContextEntries(entries: ContextEntry[]): ContextEntry[] {
  return [...entries].sort((left, right) => {
    const trust = TRUST_RANK[right.trustLevel] - TRUST_RANK[left.trustLevel];
    return trust || left.id.localeCompare(right.id) || left.contentHash.localeCompare(right.contentHash);
  });
}

async function loadSource(options: ContextSourceRegistryOptions, source: ContextSourceConfig): Promise<ContextSourceLoadResult> {
  const now = options.now ?? new Date();
  const baseSource: ContextSource = {
    schemaVersion: 1,
    revision: 0,
    name: source.name,
    kind: source.kind,
    location: source.location,
    trustLevel: source.trustLevel,
    enabled: source.enabled !== false,
    updatedAt: now.toISOString()
  };
  const cache = readSourceCache(options.root, source, now);
  if (options.offline === false && source.kind === "remote") {
    try {
      const fetched = await fetchRemoteContextPack(source, { fetch: options.fetch });
      const stored = writeSourceCache(options.root, source, fetched.pack, new Date(fetched.fetchedAt));
      return {
        source: { ...baseSource, registryHash: stored.metadata.registryHash, fetchedAt: stored.metadata.fetchedAt, updatedAt: stored.metadata.fetchedAt },
        pack: fetched.pack,
        cache: {
          status: "miss",
          stale: false,
          fallback: false,
          registryHash: stored.metadata.registryHash,
          fetchedAt: stored.metadata.fetchedAt,
          contentHash: stored.metadata.contentHash
        },
        issues: []
      };
    } catch (error) {
      if (cache.status === "hit") return cachedResult(baseSource, cache, true);
      return { source: baseSource, cache: { status: "miss", stale: false, fallback: false }, issues: [sourceIssue(source, error)] };
    }
  }
  if (source.kind === "remote") {
    if (cache.status === "hit") return cachedResult(baseSource, cache, cache.stale);
    return {
      source: baseSource,
      cache: { status: "miss", stale: false, fallback: false },
      issues: [sourceIssue(source, new ContextSourceFetchError(source.name, "network", "offline mode has no cached registry"))]
    };
  }
  const built = buildLocalContextPack({ source, repositoryRoot: options.root, validateOnly: true, generatedAt: now.toISOString() });
  if (!built.valid || !built.pack) {
    return { source: baseSource, cache: { status: "miss", stale: false, fallback: false }, issues: built.issues };
  }
  return {
    source: { ...baseSource, registryHash: built.pack.contentHash },
    pack: built.pack,
    cache: { status: "miss", stale: false, fallback: false, registryHash: built.pack.contentHash },
    issues: []
  };
}

function cachedResult(baseSource: ContextSource, cache: Extract<SourceCacheReadResult, { status: "hit" }>, fallback: boolean): ContextSourceLoadResult {
  return {
    source: {
      ...baseSource,
      registryHash: cache.value.metadata.registryHash,
      fetchedAt: cache.value.metadata.fetchedAt,
      updatedAt: cache.value.metadata.fetchedAt
    },
    pack: cache.value.pack,
    cache: {
      status: "hit",
      stale: cache.stale,
      fallback,
      registryHash: cache.value.metadata.registryHash,
      fetchedAt: cache.value.metadata.fetchedAt,
      contentHash: cache.value.metadata.contentHash
    },
    issues: []
  };
}

function mergePacks(packs: ContextPack[]): { entries: ContextEntry[]; conflicts: ContextRegistryConflict[] } {
  const groups = new Map<string, ContextEntry[]>();
  for (const pack of packs) {
    for (const entry of pack.entries) {
      const canonicalId = entry.canonicalId ?? entry.id;
      const list = groups.get(canonicalId) ?? [];
      list.push(entry);
      groups.set(canonicalId, list);
    }
  }
  const entries: ContextEntry[] = [];
  const conflicts: ContextRegistryConflict[] = [];
  for (const [canonicalId, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const sourceNames = [...new Set(group.map((entry) => entry.sourceName))].sort();
    const conflict = sourceNames.length > 1;
    if (conflict) conflicts.push({ canonicalId, sourceNames, entryIds: group.map((entry) => entry.id).sort() });
    for (const entry of rankContextEntries(group)) {
      entries.push(conflict ? { ...entry, id: conflictEntryId(entry, canonicalId), canonicalId } : entry);
    }
  }
  return { entries: rankContextEntries(entries), conflicts };
}

function createSourceFromPack(pack: ContextPack): ContextSource {
  return {
    schemaVersion: 1,
    revision: 0,
    name: pack.sourceName,
    kind: "bundled",
    location: "pack",
    trustLevel: pack.entries[0]?.trustLevel ?? "untrusted",
    enabled: true,
    updatedAt: pack.generatedAt
  };
}

function conflictEntryId(entry: ContextEntry, canonicalId: string): string {
  const sourcePrefix = `${entry.sourceName}/${canonicalId}`;
  const variantSuffix = entry.id.startsWith(sourcePrefix) ? entry.id.slice(sourcePrefix.length) : "";
  return `${entry.sourceName}:${canonicalId}${variantSuffix}`;
}

function compareSourceConfig(left: ContextSourceConfig, right: ContextSourceConfig): number {
  return TRUST_RANK[right.trustLevel] - TRUST_RANK[left.trustLevel] || left.name.localeCompare(right.name) || left.location.localeCompare(right.location);
}

function compareSources(left: ContextSource, right: ContextSource): number {
  return TRUST_RANK[right.trustLevel] - TRUST_RANK[left.trustLevel] || left.name.localeCompare(right.name);
}

function sourceIssue(source: ContextSourceConfig, error: unknown): ContextSchemaIssue {
  return { path: `sources.${source.name}`, code: "value", message: error instanceof Error ? error.message : String(error) };
}

function findDuplicateSourceNames(sources: ContextSourceConfig[]): string[] {
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(source.name, (counts.get(source.name) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
}

function validateSnapshot(snapshot: unknown): ContextSchemaIssue[] {
  const issues: ContextSchemaIssue[] = [];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [{ path: "$", code: "type", message: "expected a registry snapshot object" }];
  }
  const value = snapshot as Record<string, unknown>;
  if (value.schemaVersion !== 1) issues.push({ path: "$.schemaVersion", code: "version", message: "expected schemaVersion 1" });
  if (!Number.isInteger(value.revision) || Number(value.revision) < 0)
    issues.push({ path: "$.revision", code: "revision", message: "expected a non-negative integer" });
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt)))
    issues.push({ path: "$.generatedAt", code: "format", message: "expected an ISO-8601 timestamp" });
  if (!Array.isArray(value.entries)) issues.push({ path: "$.entries", code: "type", message: "expected an array" });
  if (!Array.isArray(value.sources)) issues.push({ path: "$.sources", code: "type", message: "expected an array" });
  if (!Array.isArray(value.conflicts)) issues.push({ path: "$.conflicts", code: "type", message: "expected an array" });
  if (!Array.isArray(value.cache)) issues.push({ path: "$.cache", code: "type", message: "expected an array" });
  if (typeof value.registryHash !== "string" || !/^[a-f0-9]{64}$/i.test(value.registryHash))
    issues.push({ path: "$.registryHash", code: "format", message: "expected a SHA-256 hex digest" });
  for (const [index, entry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
    const result = validateContextEntry(entry, `$.entries[${index}]`);
    if (!result.valid) issues.push(...result.issues);
  }
  for (const [index, source] of (Array.isArray(value.sources) ? value.sources : []).entries()) {
    const result = validateContextSource(source, `$.sources[${index}]`);
    if (!result.valid) issues.push(...result.issues);
  }
  if (Array.isArray(value.entries) && typeof value.registryHash === "string" && hashContextValue(value.entries) !== value.registryHash) {
    issues.push({ path: "$.registryHash", code: "value", message: "does not match snapshot entries" });
  }
  return issues;
}
