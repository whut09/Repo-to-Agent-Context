import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { readJsonDiagnostic, writeJsonAtomicWithRevision } from "./atomic-store.js";
import type { CacheStats, DependencyGraph, IndexedFile, OpenCodePlusplusConfig, RepoFile, RepoScan, TokenizerConfig } from "./types.js";
import type { TokenCountCache } from "./token-estimator.js";

const CACHE_VERSION = 1;
const CACHE_DIR = ".agent-context/cache";
const HASHED_FILE_LIMIT_BYTES = 8 * 1024 * 1024;

interface FileHashEntry {
  hash: string;
  sizeBytes: number;
  mtimeMs: number;
}

interface FileHashesCache {
  schemaVersion: 1;
  revision: number;
  version: number;
  configFingerprint: string;
  dependencyFingerprint: string;
  files: Record<string, FileHashEntry>;
}

interface IndexCacheEntry {
  schemaVersion: 1;
  revision: number;
  version: number;
  fileHash: string;
  dependencyFingerprint: string;
  analyzer: string;
  indexed: IndexedFile;
}

interface IndexCacheFile {
  schemaVersion: 1;
  revision: number;
  version: number;
  entries: Record<string, IndexCacheEntry>;
}

interface GraphCacheFile {
  schemaVersion: 1;
  revision: number;
  version: number;
  indexFingerprint: string;
  graph: DependencyGraph | null;
}

interface TokenizerCacheFile {
  schemaVersion: 1;
  revision: number;
  version: number;
  entries: Record<string, number>;
}

export interface ContextCacheOptions {
  enabled?: boolean;
}

export class ContextCache implements TokenCountCache {
  readonly root: string;
  readonly configFingerprint: string;
  readonly stats: CacheStats;
  private readonly cacheDir: string;
  private readonly fileHashesPath: string;
  private readonly indexCachePath: string;
  private readonly graphCachePath: string;
  private readonly tokenizerCachePath: string;
  private fileHashes: FileHashesCache;
  private indexCache: IndexCacheFile;
  private graphCache: GraphCacheFile;
  private tokenizerCache: TokenizerCacheFile;

  private constructor(root: string, config: OpenCodePlusplusConfig) {
    this.root = root;
    this.configFingerprint = hashText(stableStringify(config));
    this.stats = createCacheStats(true);
    this.cacheDir = path.join(root, CACHE_DIR);
    this.fileHashesPath = path.join(this.cacheDir, "file-hashes.json");
    this.indexCachePath = path.join(this.cacheDir, "index-cache.json");
    this.graphCachePath = path.join(this.cacheDir, "graph-cache.json");
    this.tokenizerCachePath = path.join(this.cacheDir, "tokenizer-cache.json");
    this.fileHashes = readJson(this.fileHashesPath, {
      schemaVersion: 1,
      revision: 0,
      version: CACHE_VERSION,
      configFingerprint: this.configFingerprint,
      dependencyFingerprint: "",
      files: {}
    });
    this.indexCache = readJson(this.indexCachePath, { schemaVersion: 1, revision: 0, version: CACHE_VERSION, entries: {} });
    this.graphCache = readJson(this.graphCachePath, { schemaVersion: 1, revision: 0, version: CACHE_VERSION, indexFingerprint: "", graph: null });
    this.tokenizerCache = readJson(this.tokenizerCachePath, { schemaVersion: 1, revision: 0, version: CACHE_VERSION, entries: {} });
  }

  static open(root: string, config: OpenCodePlusplusConfig, options: ContextCacheOptions = {}): ContextCache | null {
    if (options.enabled === false) return null;
    const absoluteRoot = path.resolve(root);
    if (!shouldPersistCache(absoluteRoot)) return null;
    return new ContextCache(absoluteRoot, config);
  }

  dependencyFingerprint(scan: RepoScan): string {
    const dependencyFiles = scan.files.filter((file) => isDependencyResolutionFile(file.path)).sort((a, b) => a.path.localeCompare(b.path));
    const fingerprint = hashText([this.configFingerprint, ...dependencyFiles.map((file) => `${file.path}:${this.fileHash(file)}`)].join("\n"));
    this.fileHashes.dependencyFingerprint = fingerprint;
    this.fileHashes.configFingerprint = this.configFingerprint;
    return fingerprint;
  }

  fileHash(file: RepoFile): string {
    const current = statSync(file.absolutePath);
    const previous = this.fileHashes.files[file.path];
    if (previous && previous.sizeBytes === current.size && previous.mtimeMs === current.mtimeMs) {
      this.stats.fileHashHits += 1;
      return previous.hash;
    }

    this.stats.fileHashMisses += 1;
    const hash = shouldHashContent(file, current.size) ? hashFile(file.absolutePath) : hashText(`${file.path}:${current.size}:${current.mtimeMs}`);
    this.fileHashes.files[file.path] = {
      hash,
      sizeBytes: current.size,
      mtimeMs: current.mtimeMs
    };
    return hash;
  }

  getIndexedFile(file: RepoFile, dependencyFingerprint: string, analyzer: string): IndexedFile | null {
    const entry = this.indexCache.entries[file.path];
    if (!entry || entry.version !== CACHE_VERSION || entry.dependencyFingerprint !== dependencyFingerprint || entry.analyzer !== analyzer) {
      this.stats.indexMisses += 1;
      return null;
    }
    if (entry.fileHash !== this.fileHash(file)) {
      this.stats.indexMisses += 1;
      return null;
    }
    this.stats.indexHits += 1;
    return cloneIndexedFile({ ...entry.indexed, ...file });
  }

  setIndexedFile(file: RepoFile, dependencyFingerprint: string, analyzer: string, indexed: IndexedFile): void {
    this.indexCache.entries[file.path] = {
      version: CACHE_VERSION,
      schemaVersion: 1,
      revision: 0,
      fileHash: this.fileHash(file),
      dependencyFingerprint,
      analyzer,
      indexed: cloneIndexedFile(indexed)
    };
  }

  prune(scan: RepoScan): void {
    const paths = new Set(scan.files.map((file) => file.path));
    for (const pathKey of Object.keys(this.fileHashes.files)) {
      if (!paths.has(pathKey)) {
        delete this.fileHashes.files[pathKey];
        this.stats.prunedFileHashes += 1;
      }
    }
    for (const pathKey of Object.keys(this.indexCache.entries)) {
      if (!paths.has(pathKey)) {
        delete this.indexCache.entries[pathKey];
        this.stats.prunedIndexEntries += 1;
      }
    }
  }

  getGraph(indexFingerprint: string): DependencyGraph | null {
    if (this.graphCache.version === CACHE_VERSION && this.graphCache.indexFingerprint === indexFingerprint && this.graphCache.graph) {
      this.stats.graphHits += 1;
      return cloneGraph(this.graphCache.graph);
    }
    this.stats.graphMisses += 1;
    return null;
  }

  setGraph(indexFingerprint: string, graph: DependencyGraph): void {
    this.graphCache = {
      schemaVersion: 1,
      revision: this.graphCache.revision,
      version: CACHE_VERSION,
      indexFingerprint,
      graph: cloneGraph(graph)
    };
  }

  indexFingerprint(files: IndexedFile[]): string {
    return hashText(
      files
        .map(
          (file) =>
            `${file.path}:${this.fileHashes.files[file.path]?.hash ?? "missing"}:${file.imports.map((item) => `${item.specifier}->${item.resolvedPath ?? ""}`).join(",")}`
        )
        .sort()
        .join("\n")
    );
  }

  getTokenCount(key: string): number | undefined {
    const value = this.tokenizerCache.entries[key];
    if (typeof value === "number") {
      this.stats.tokenHits += 1;
    } else {
      this.stats.tokenMisses += 1;
    }
    return value;
  }

  setTokenCount(key: string, tokens: number): void {
    this.tokenizerCache.entries[key] = tokens;
  }

  flush(): void {
    mkdirSync(this.cacheDir, { recursive: true });
    this.fileHashes = writeJson(this.fileHashesPath, normalizeFileHashes(this.fileHashes), this.fileHashes.revision);
    this.indexCache = writeJson(this.indexCachePath, this.indexCache, this.indexCache.revision);
    this.graphCache = writeJson(this.graphCachePath, this.graphCache, this.graphCache.revision);
    this.tokenizerCache = writeJson(this.tokenizerCachePath, this.tokenizerCache, this.tokenizerCache.revision);
  }

  snapshotStats(): CacheStats {
    return { ...this.stats };
  }
}

export function createCacheStats(enabled: boolean): CacheStats {
  return {
    enabled,
    fileHashHits: 0,
    fileHashMisses: 0,
    indexHits: 0,
    indexMisses: 0,
    graphHits: 0,
    graphMisses: 0,
    tokenHits: 0,
    tokenMisses: 0,
    prunedFileHashes: 0,
    prunedIndexEntries: 0
  };
}

export function tokenizerCacheKey(text: string, tokenizer: TokenizerConfig): string {
  return `${tokenizer.mode}:${tokenizer.model ?? ""}:${hashText(text)}`;
}

function shouldPersistCache(root: string): boolean {
  return existsSync(path.join(root, ".git")) || existsSync(path.join(root, ".agent-context"));
}

function isDependencyResolutionFile(filePath: string): boolean {
  return /(^|\/)(package\.json|tsconfig\.json|jsconfig\.json|pyproject\.toml|pnpm-workspace\.yaml|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(
    filePath
  );
}

function shouldHashContent(file: RepoFile, sizeBytes: number): boolean {
  return !file.isBinary && sizeBytes <= HASHED_FILE_LIMIT_BYTES;
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function readJson<T>(filePath: string, fallback: T): T {
  const result = readJsonDiagnostic<T & { version?: number; schemaVersion?: number; revision?: number }>(filePath);
  if (result.status === "missing") return fallback;
  if (result.status === "corrupt") {
    console.warn(`Cache file is corrupt and will be rebuilt: ${filePath}: ${result.error}`);
    return fallback;
  }
  if (result.value.version !== CACHE_VERSION) return fallback;
  return { ...fallback, ...result.value, schemaVersion: result.value.schemaVersion ?? 1, revision: result.value.revision ?? 0 } as T;
}

function writeJson<T extends { revision: number }>(filePath: string, value: T, revision: number): T {
  return writeJsonAtomicWithRevision(filePath, value, revision);
}

function normalizeFileHashes(cache: FileHashesCache): FileHashesCache {
  return {
    schemaVersion: 1,
    revision: cache.revision,
    version: CACHE_VERSION,
    configFingerprint: cache.configFingerprint,
    dependencyFingerprint: cache.dependencyFingerprint,
    files: Object.fromEntries(Object.entries(cache.files).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function cloneIndexedFile(file: IndexedFile): IndexedFile {
  return JSON.parse(JSON.stringify(file)) as IndexedFile;
}

function cloneGraph(graph: DependencyGraph): DependencyGraph {
  return JSON.parse(JSON.stringify(graph)) as DependencyGraph;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
