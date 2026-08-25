import { buildApplicationContext } from "./context-service.js";
import { createContextRetriever } from "../retrievers/index.js";
import { adaptiveTopK, type RetrieverProvider } from "../retrievers/types.js";
import { loadContextSourceRegistry } from "../context-registry/source-registry.js";
import { buildTestSelection } from "../outputs/test-selector.js";
import { unique } from "../core/collections.js";
import type { ContextPackage } from "../core/types.js";

export interface RetrieveApplicationInput {
  repo: string;
  task: string;
  provider?: RetrieverProvider;
  topK?: number;
  taskType?: "bugfix" | "feature" | "refactor" | "auto";
  modules?: string[];
  changedFiles?: string[];
  negativeExamples?: string[];
  includeTests?: boolean;
  packageVersion?: string;
  language?: string;
  source?: string;
  tags?: string[];
  context?: ContextPackage;
}

export async function retrieveApplicationContext(input: RetrieveApplicationInput) {
  const context = input.context ?? (await buildApplicationContext(input.repo));
  const provider = input.provider ?? "hybrid";
  const registryResult = context.config.contextRegistry.enabled
    ? await loadContextSourceRegistry({
        root: context.scan.root,
        sources: context.config.contextRegistry.sources,
        offline: context.config.contextRegistry.offline
      })
    : undefined;
  const retriever = createContextRetriever(context, provider, registryResult?.snapshot);
  const hits = await retriever.search(input.task, {
    topK: adaptiveTopK(input.taskType ?? "auto", input.topK),
    taskType: input.taskType ?? "auto",
    modules: input.modules,
    changedFiles: input.changedFiles,
    negativeExamples: input.negativeExamples,
    includeTests: input.includeTests ?? false,
    packageVersion: input.packageVersion,
    language: input.language,
    source: input.source,
    tags: input.tags
  });
  const selectionPaths = unique([
    ...(input.changedFiles ?? []),
    ...hits
      .slice(0, 3)
      .map((hit) => hit.path)
      .filter(Boolean)
  ]);
  const selection = buildTestSelection(context, { forPaths: selectionPaths.length ? selectionPaths : undefined, diff: false });
  const relatedFiles = unique(hits.flatMap((hit) => (hit.relatedFiles?.length ? hit.relatedFiles : [hit.path]))).sort();
  const mustInspect = unique(hits.flatMap((hit) => hit.mustInspect ?? [])).sort();
  const selectedRepoFiles = new Set(hits.map((hit) => hit.path));
  const rejectedFiles = context.index.files
    .map((file) => file.path)
    .filter((file) => !selectedRepoFiles.has(file))
    .sort()
    .slice(0, 50);
  return {
    task: input.task,
    provider,
    hits: hits.map((hit) => ({
      path: hit.path,
      reason: hit.title || hit.snippet || "Matches task terms",
      confidence: confidenceForScore(hit.score),
      evidence: [],
      score: Number(hit.score.toFixed(1)),
      moduleName: hit.moduleName,
      kind: hit.kind,
      source: hit.source,
      relatedFiles: hit.relatedFiles ?? [hit.path],
      mustInspect: hit.mustInspect ?? [],
      rejectedFiles: hit.rejectedFiles ?? [],
      metadata: hit.metadata
    })),
    relatedFiles,
    mustInspect,
    rejectedFiles,
    registry: registryResult
      ? {
          valid: registryResult.valid,
          issues: registryResult.issues,
          conflicts: registryResult.snapshot?.conflicts ?? [],
          cache: registryResult.snapshot?.cache ?? []
        }
      : undefined,
    suggestedCommands: unique([...selection.minimalCommands, ...selection.recommendedCommands]).slice(0, 6)
  };
}

export async function explainApplicationPath(input: { repo: string; targetPath: string }) {
  const context = await buildApplicationContext(input.repo);
  const targetPath = input.targetPath.replace(/\\/g, "/");
  const file = context.index.files.find((candidate) => candidate.path === targetPath);
  if (file) {
    return {
      kind: "file",
      path: file.path,
      moduleName: file.moduleName,
      summary: file.summary,
      analyzer: file.analyzer,
      confidence: file.confidence,
      imports: file.imports.map((item) => item.specifier),
      exports: file.exports,
      importanceScore: file.importanceScore,
      importanceReasons: file.importanceReasons
    };
  }
  const module = context.index.modules.find((candidate) => candidate.name === targetPath);
  if (module) return { kind: "module", name: module.name, summary: module.summary, files: module.files, imports: module.imports };
  return { kind: "error", message: `No file or module found for: ${input.targetPath}` };
}

function confidenceForScore(score: number): "high" | "medium" | "low" {
  if (score >= 40) return "high";
  if (score >= 15) return "medium";
  return "low";
}
