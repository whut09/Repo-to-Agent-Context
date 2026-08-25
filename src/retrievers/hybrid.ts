import type { ContextRetriever, ContextRetrieverOptions, ContextHit } from "./types.js";
import { mergeScoreBreakdowns, sortHits } from "./static.js";

export class HybridContextRetriever implements ContextRetriever {
  readonly name = "hybrid" as const;

  constructor(private readonly retrievers: ContextRetriever[]) {}

  async search(task: string, options: ContextRetrieverOptions): Promise<ContextHit[]> {
    const merged = new Map<string, ContextHit>();
    for (const retriever of this.retrievers) {
      const hits = await retriever.search(task, { ...options, topK: Math.max(options.topK * 2, options.topK) });
      for (const hit of hits) {
        const current = merged.get(hit.path);
        if (!current) {
          merged.set(hit.path, {
            ...hit,
            source: this.name,
            relatedFiles: [...(hit.relatedFiles ?? [hit.path])].sort(),
            mustInspect: [...(hit.mustInspect ?? [])].sort(),
            rejectedFiles: [...(hit.rejectedFiles ?? [])].sort(),
            metadata: { ...hit.metadata, sources: [hit.source] }
          });
          continue;
        }
        current.score += hit.score;
        current.metadata.scoreBreakdown = mergeScoreBreakdowns(current.metadata.scoreBreakdown, hit.metadata.scoreBreakdown);
        current.metadata.sources = [...new Set([...(current.metadata.sources as string[]), hit.source])];
        current.relatedFiles = [...new Set([...(current.relatedFiles ?? []), ...(hit.relatedFiles ?? [hit.path])])].sort();
        current.mustInspect = [...new Set([...(current.mustInspect ?? []), ...(hit.mustInspect ?? [])])].sort();
        current.rejectedFiles = [...new Set([...(current.rejectedFiles ?? []), ...(hit.rejectedFiles ?? [])])].sort();
        if (hit.snippet.length > current.snippet.length) current.snippet = hit.snippet;
      }
    }

    return sortHits([...merged.values()]).slice(0, Math.max(1, options.topK));
  }
}
