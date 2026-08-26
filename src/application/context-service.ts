import path from "node:path";
import { buildContextPackage, type BuildOptions } from "../core/context-builder.js";
import type { ContextPackage } from "../core/types.js";
import { writeContextPackage } from "../outputs/renderers/writer.js";
import { loadContextSourceRegistry } from "../context-registry/source-registry.js";
import { buildLocalContextPack, type BuiltContextDocument } from "../context-registry/registry-builder.js";
import { selectContextFiles } from "../context-registry/content-reader.js";
import { adaptiveTopK } from "../retrievers/types.js";
import { rankContextEntriesForTask } from "../core/ranker.js";
import { currentWorkingTreeFingerprint } from "../core/working-tree.js";
import { injectContextAnnotation, listContextAnnotations, readContextAnnotation } from "../context-registry/annotations.js";
import type { ContextEntry, ContextFetchResult, ContextFetchSelectionMode, ContextProvenance, ContextSourceConfig } from "../context-registry/types.js";
import { readApplicationContextQualitySignals } from "./context-feedback-service.js";

export interface ContextServiceResult {
  context: ContextPackage;
  writtenFiles: string[];
}

export async function buildApplicationContext(repo: string, options: BuildOptions = {}): Promise<ContextPackage> {
  return buildContextPackage(path.resolve(repo), options);
}

export async function buildAndWriteApplicationContext(repo: string, options: BuildOptions = {}): Promise<ContextServiceResult> {
  const context = await buildApplicationContext(repo, options);
  const result = writeContextPackage(context);
  return {
    context,
    writtenFiles: result.files.map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/"))
  };
}

export interface SearchContextEntriesInput {
  repo: string;
  query?: string;
  topK?: number;
  taskType?: "bugfix" | "feature" | "refactor" | "auto";
  packageVersion?: string;
  language?: string;
  source?: string;
  tags?: string[];
  negativeExamples?: string[];
}

export interface ContextEntrySearchResult {
  query: string;
  entries: ContextEntry[];
  hits: Array<{
    entry: ContextEntry;
    score: number;
    exactId: boolean;
    scoreBreakdown: import("../retrievers/types.js").RetrievalScoreBreakdown;
  }>;
  cache: ContextFetchResult["cache"][];
  conflicts: Array<{ canonicalId: string; sourceNames: string[]; entryIds: string[] }>;
  issues: Array<{ path: string; code: string; message: string }>;
}

export interface GetContextEntryInput {
  repo: string;
  id: string;
  packageVersion?: string;
  language?: string;
  source?: string;
}

export interface GetContextEntryResult {
  entry: ContextEntry;
  provenance: ContextProvenance;
  cache: ContextFetchResult["cache"];
  conflicts: Array<{ canonicalId: string; sourceNames: string[]; entryIds: string[] }>;
  annotationAvailability: ReturnType<typeof listContextAnnotations>;
}

export interface GetContextFilesInput {
  repo: string;
  id: string;
  file?: string;
  mode?: ContextFetchSelectionMode;
  full?: boolean;
  packageVersion?: string;
  language?: string;
  source?: string;
  annotationId?: string;
  includeStaleAnnotation?: boolean;
  withAnnotations?: boolean;
}

const fetchedDocumentCache = new Map<string, { document: BuiltContextDocument; workingTreeHash: string; packHash: string }>();

export async function searchContextEntries(input: SearchContextEntriesInput): Promise<ContextEntrySearchResult> {
  const root = path.resolve(input.repo);
  const loaded = await loadRegistry(root);
  const query = input.query?.trim() ?? "";
  const ranked = rankContextEntriesForTask(query, loaded.snapshot?.entries ?? [], {
    taskType: input.taskType,
    packageVersion: input.packageVersion,
    language: input.language,
    source: input.source,
    tags: input.tags,
    negativeExamples: input.negativeExamples,
    localQualitySignals: loaded.config.feedback.useLocalQualitySignals ? readApplicationContextQualitySignals(root) : undefined
  });
  const limit = adaptiveTopK(input.taskType ?? "auto", input.topK);
  const hits = ranked.slice(0, limit);
  return {
    query,
    entries: hits.map((item) => item.entry),
    hits,
    cache: loaded.snapshot?.cache ?? [],
    conflicts: loaded.snapshot?.conflicts ?? [],
    issues: loaded.issues
  };
}

export async function getContextEntry(input: GetContextEntryInput): Promise<GetContextEntryResult> {
  const root = path.resolve(input.repo);
  const loaded = await loadRegistry(root);
  const entry = findEntry(loaded.snapshot?.entries ?? [], input);
  if (!entry) throw new Error(`Context entry was not found: ${input.id}`);
  const annotationScope = { repository: root, entryId: entry.id, packageVersion: entry.packageVersion, contentRevision: entry.contentRevision };
  return {
    entry,
    provenance: { ...entry.provenance, verified: false },
    cache: cacheForSource(loaded.snapshot?.cache ?? [], entry.sourceName),
    conflicts: loaded.snapshot?.conflicts ?? [],
    annotationAvailability: listContextAnnotations(annotationScope)
  };
}

export async function getContextFiles(input: GetContextFilesInput): Promise<ContextFetchResult> {
  const startedAt = Date.now();
  const root = path.resolve(input.repo);
  const loaded = await loadRegistry(root);
  const entry = findEntry(loaded.snapshot?.entries ?? [], input);
  if (!entry) throw new Error(`Context entry was not found: ${input.id}`);
  const source = findSource(loaded.sourceConfigs, entry.sourceName);
  if (!source) throw new Error(`Context source is not configured for entry: ${entry.sourceName}`);
  if (source.kind !== "local" && source.kind !== "bundled") {
    throw new Error(`Context source ${entry.sourceName} does not expose local files; use a local source to fetch content.`);
  }

  const built = buildLocalContextPack({ source, repositoryRoot: root, validateOnly: true });
  if (!built.valid || !built.pack) {
    throw new Error(built.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ") || `Context source is invalid: ${source.name}`);
  }
  const document = findBuiltDocument(built.documents, entry);
  if (!document) throw new Error(`Context files are unavailable for entry: ${entry.id}`);
  const workingTreeHash = currentWorkingTreeFingerprint(root);
  const cacheKey = `${root}\0${entry.id}`;
  const previous = fetchedDocumentCache.get(cacheKey);
  const cacheHit = Boolean(previous && previous.workingTreeHash === workingTreeHash && previous.packHash === built.pack.contentHash);
  fetchedDocumentCache.set(cacheKey, { document, workingTreeHash, packHash: built.pack.contentHash });
  const mode = input.mode ?? (input.full ? "full" : input.file ? "file" : "entry");
  if (mode === "full" && input.file) throw new Error("Context full mode cannot be combined with a file selector.");
  const selection = selectContextFiles(document, entry, input.file, mode === "full");
  const annotationScope = { repository: root, entryId: entry.id, packageVersion: entry.packageVersion, contentRevision: entry.contentRevision };
  const annotationAvailability = listContextAnnotations(annotationScope);
  const annotations = input.withAnnotations
    ? annotationAvailability.annotations
        .filter((annotation) => !annotation.stale)
        .map((annotation) => readContextAnnotation({ ...annotationScope, id: annotation.id }).annotation)
    : undefined;
  const annotationInjection = input.annotationId
    ? injectContextAnnotation({ ...annotationScope, id: input.annotationId, allowStale: input.includeStaleAnnotation })
    : undefined;
  const sourceChanged = Boolean(previous && previous.packHash !== built.pack.contentHash);
  const freshness = {
    status: "fresh" as const,
    workingTreeHash,
    checkedAt: new Date().toISOString(),
    ...(previous && (previous.workingTreeHash !== workingTreeHash || sourceChanged)
      ? { reason: "Working tree or context source changed; context was revalidated." }
      : {})
  };
  const cache = {
    ...cacheForSource(loaded.snapshot?.cache ?? [], entry.sourceName),
    status: cacheHit ? ("hit" as const) : ("miss" as const),
    sourceName: entry.sourceName,
    sourceRegistryHash: built.pack.contentHash,
    contentHash: entry.contentHash,
    stale: false
  };
  return {
    schemaVersion: 1,
    revision: entry.revision,
    entry,
    selectedFiles: selection.selectedFiles,
    omittedFiles: selection.omittedFiles,
    files: selection.files,
    fetchMode: mode,
    provenance: { ...entry.provenance, verified: true },
    cache,
    contextMode: cacheHit ? "reused" : previous ? "incremental" : "rebuilt",
    freshness,
    annotationAvailability,
    ...(annotations ? { annotations } : {}),
    ...(annotationInjection ? { annotationInjection: annotationInjection.injection } : {}),
    durationMs: Date.now() - startedAt
  };
}

async function loadRegistry(root: string) {
  const context = await buildApplicationContext(root);
  const result = context.config.contextRegistry.enabled
    ? await loadContextSourceRegistry({ root, sources: context.config.contextRegistry.sources, offline: context.config.contextRegistry.offline })
    : { valid: true, sources: [], issues: [], snapshot: undefined };
  if (!result.valid && !result.snapshot) {
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ") || "Context registry is invalid.");
  }
  return { ...result, sourceConfigs: context.config.contextRegistry.sources, config: context.config };
}

function findEntry(entries: ContextEntry[], input: { id: string; packageVersion?: string; language?: string; source?: string }): ContextEntry | undefined {
  return entries.find(
    (entry) =>
      (entry.id === input.id || entry.canonicalId === input.id || entry.name === input.id) &&
      (!input.packageVersion || entry.packageVersion === input.packageVersion) &&
      (!input.language || entry.language === input.language) &&
      (!input.source || entry.sourceName === input.source)
  );
}

function findSource(sources: ContextSourceConfig[], sourceName: string): ContextSourceConfig | undefined {
  return sources.find((source) => source.name === sourceName);
}

function cacheForSource(cache: ContextFetchResult["cache"][], sourceName: string): ContextFetchResult["cache"] {
  return cache.find((item) => item.sourceName === sourceName) ?? { status: "miss", sourceName };
}

function findBuiltDocument(documents: BuiltContextDocument[], entry: ContextEntry): BuiltContextDocument | undefined {
  return documents.find(
    (document) =>
      document.entry.sourceName === entry.sourceName &&
      (document.entry.id === entry.id ||
        (document.entry.canonicalId === entry.canonicalId &&
          document.entry.language === entry.language &&
          document.entry.packageVersion === entry.packageVersion &&
          document.entry.apiVersion === entry.apiVersion))
  );
}
