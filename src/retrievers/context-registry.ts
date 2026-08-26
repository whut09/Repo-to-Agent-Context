import type { ContextEntry, ContextRegistrySnapshot } from "../context-registry/types.js";
import { rankContextEntriesForTask } from "../core/ranker.js";
import type { ContextHit, ContextRetriever, ContextRetrieverOptions } from "./types.js";

export type ContextRegistryInput = ContextRegistrySnapshot | ContextEntry[];

export class ContextRegistryRetriever implements ContextRetriever {
  readonly name = "static" as const;
  private readonly entries: ContextEntry[];

  constructor(registry: ContextRegistryInput) {
    this.entries = Array.isArray(registry) ? registry : registry.entries;
  }

  async search(task: string, options: ContextRetrieverOptions): Promise<ContextHit[]> {
    const ranked = rankContextEntriesForTask(task, this.entries, {
      taskType: options.taskType,
      packageVersion: options.packageVersion,
      language: options.language,
      source: options.source,
      tags: options.tags,
      negativeExamples: options.negativeExamples,
      localQualitySignals: options.localQualitySignals
    });
    return ranked.slice(0, Math.max(1, options.topK)).map(({ entry, score, scoreBreakdown, exactId }) => {
      const relatedFiles = entry.files.map((file) => `context://${entry.sourceName}/${file.path}`).sort();
      const mustInspect = entry.files
        .filter((file) => file.role === "entry")
        .map((file) => `context://${entry.sourceName}/${file.path}`)
        .sort();
      return {
        id: entry.id,
        path: entry.id,
        title: entry.name,
        moduleName: entry.canonicalId ?? entry.name,
        kind: entry.kind,
        score,
        source: this.name,
        snippet: entry.description,
        relatedFiles,
        mustInspect,
        rejectedFiles: [],
        metadata: {
          contextSource: entry.sourceName,
          contextTrustLevel: entry.trustLevel,
          packageVersion: entry.packageVersion,
          language: entry.language,
          tags: entry.tags,
          exactId,
          scoreBreakdown,
          provenance: entry.provenance
        }
      };
    });
  }
}
