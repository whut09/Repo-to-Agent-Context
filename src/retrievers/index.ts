import type { ContextPackage } from "../core/types.js";
import { StaticContextRetriever } from "./static.js";
import { RipgrepContextRetriever } from "./ripgrep.js";
import { HybridContextRetriever } from "./hybrid.js";
import { ExternalProtocolRetriever } from "./external.js";
import { CodeGraphContextRetriever } from "./codegraph.js";
import type { ContextHit, ContextRetriever, RetrieverProvider } from "./types.js";
import type { ContextRegistryInput } from "./context-registry.js";
import { code, heading, table } from "../outputs/renderers/markdown.js";

export type { ContextHit, ContextRetriever, ContextRetrieverOptions, RetrieverProvider } from "./types.js";
export type { ContextRegistryInput } from "./context-registry.js";

export function createContextRetriever(context: ContextPackage, provider: RetrieverProvider, registry?: ContextRegistryInput): ContextRetriever {
  if (provider === "static") return new StaticContextRetriever(context, registry);
  if (provider === "ripgrep") return new RipgrepContextRetriever(context);
  if (provider === "hybrid") return new HybridContextRetriever([new StaticContextRetriever(context, registry), new RipgrepContextRetriever(context)]);
  if (provider === "codegraph") return new CodeGraphContextRetriever(context);
  return new ExternalProtocolRetriever(provider);
}

export function renderContextHits(task: string, provider: RetrieverProvider, hits: ContextHit[]): string {
  const fallbackReason = firstFallbackReason(hits);
  return [
    heading(1, "Context Retrieval"),
    "",
    `Task: ${task}`,
    `Provider: ${provider}`,
    ...(fallbackReason ? [`Fallback: ${fallbackReason}`] : []),
    "",
    table(
      ["Score", "Path", "Module", "Kind", "Source"],
      hits.map((hit) => [hit.score.toFixed(1), code(hit.path), hit.moduleName, hit.kind, hit.source])
    ),
    "",
    heading(2, "Snippets"),
    ...hits.flatMap((hit) => {
      const breakdown = hit.metadata.scoreBreakdown;
      const signals = breakdown
        ? `Signals: lexical=${(breakdown.lexical ?? 0).toFixed(1)}, symbol=${(breakdown.symbol ?? 0).toFixed(1)}, dependency=${(breakdown.dependency ?? breakdown.dependencyChain ?? 0).toFixed(1)}, source=${(breakdown.source ?? 0).toFixed(1)}, quality=${(breakdown.quality ?? 0).toFixed(1)}, regression=${(breakdown.regression ?? breakdown.regressionMemory ?? 0).toFixed(1)}, negativePenalty=${(breakdown.negativePenalty ?? breakdown.negativeExample ?? 0).toFixed(1)}`
        : "Signals: unavailable";
      return [
        "",
        heading(3, hit.path),
        signals,
        `Related files: ${(hit.relatedFiles ?? []).join(", ") || "none"}`,
        `Must inspect: ${(hit.mustInspect ?? []).join(", ") || "none"}`,
        `Rejected files: ${(hit.rejectedFiles ?? []).join(", ") || "none"}`,
        hit.snippet || "No snippet available."
      ];
    })
  ].join("\n");
}

function firstFallbackReason(hits: ContextHit[]): string | undefined {
  for (const hit of hits) {
    const reason = hit.metadata.codegraphFallbackReason;
    if (typeof reason === "string" && reason.trim()) return reason;
  }
  return undefined;
}
