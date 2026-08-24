import type { ContextPackage, IndexedFile } from "../core/types.js";
import { buildRagDocuments } from "../outputs/rag.js";
import type { ContextHit, ContextRetriever, ContextRetrieverOptions } from "./types.js";

export class StaticContextRetriever implements ContextRetriever {
  readonly name = "static" as const;

  constructor(private readonly context: ContextPackage) {}

  async search(task: string, options: ContextRetrieverOptions): Promise<ContextHit[]> {
    const terms = taskTerms(task);
    const fileMap = new Map(this.context.index.files.map((file) => [file.path, file]));
    const changed = new Set(options.changedFiles ?? []);
    const docs = buildRagDocuments(this.context);
    const hits = docs
      .map((doc) => {
        const file = fileMap.get(doc.path);
        if (!matchesFilters(file, doc.moduleName, options)) return null;
        const haystack = [doc.title, doc.path, doc.moduleName, doc.kind, doc.text].join("\n").toLowerCase();
        const pathScore = scoreTerms(terms, doc.path.toLowerCase()) * 1.5;
        const textScore = scoreTerms(terms, haystack);
        const changedBoost = changed.has(doc.path) ? 50 : 0;
        const importance = typeof doc.metadata.importanceScore === "number" ? doc.metadata.importanceScore / 20 : 0;
        const taskTypeBoost = taskTypeWeight(options.taskType, doc.kind, doc.path);
        const symbolBoost = symbolRelevance(file, terms);
        const chainBoost = dependencyChainWeight(this.context, doc.path, changed);
        const regressionBoost = regressionWeight(doc.path, doc.text);
        const negativePenalty = negativeExamplePenalty(doc.path, doc.text, task);
        const score = pathScore + textScore + changedBoost + importance + taskTypeBoost + symbolBoost + chainBoost + regressionBoost - negativePenalty;
        if (score <= 0 && terms.length > 0 && !changedBoost) return null;
        return {
          id: doc.id,
          path: doc.path,
          title: doc.title,
          moduleName: doc.moduleName,
          kind: doc.kind,
          score,
          source: this.name,
          snippet: snippetFor(doc.text, terms),
          metadata: {
            ...doc.metadata,
            tokens: doc.tokens,
            scoreBreakdown: {
              lexical: textScore,
              path: pathScore,
              changed: changedBoost,
              importance,
              taskType: taskTypeBoost,
              symbol: symbolBoost,
              dependencyChain: chainBoost,
              regressionMemory: regressionBoost,
              negativeExample: negativePenalty,
              total: score
            }
          }
        };
      })
      .filter((hit): hit is NonNullable<typeof hit> => Boolean(hit));

    return sortHits(hits).slice(0, Math.max(1, options.topK));
  }
}

export function taskTerms(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .match(/[\p{L}\p{N}_/-]+/gu)
        ?.filter((term) => term.length >= 2) ?? []
    )
  ];
}

export function scoreTerms(terms: string[], haystack: string): number {
  return terms.reduce((score, term) => score + (haystack.includes(term) ? Math.min(40, 10 + term.length * 2) : 0), 0);
}

export function snippetFor(text: string, terms: string[]): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const index =
    terms
      .map((term) => lower.indexOf(term))
      .filter((item) => item >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 80);
  const end = Math.min(normalized.length, index + 220);
  return `${start > 0 ? "..." : ""}${normalized.slice(start, end)}${end < normalized.length ? "..." : ""}`;
}

export function matchesFilters(file: IndexedFile | undefined, moduleName: string, options: ContextRetrieverOptions): boolean {
  if (options.modules?.length && !options.modules.includes(moduleName)) return false;
  if (file?.isTest && !options.includeTests) return false;
  return true;
}

function taskTypeWeight(taskType: ContextRetrieverOptions["taskType"], kind: string, filePath: string): number {
  if (taskType === "bugfix" && /test|spec/i.test(kind) && /test|spec/i.test(filePath)) return 8;
  if (taskType === "feature" && /source|entry/i.test(kind)) return 6;
  if (taskType === "refactor" && /source|module/i.test(kind)) return 5;
  return 0;
}

export function symbolRelevance(file: IndexedFile | undefined, terms: string[]): number {
  if (!file || !terms.length) return 0;
  const symbols = [...file.symbols.map((symbol) => symbol.name), ...file.exports].map((value) => value.toLowerCase());
  const matches = terms.filter((term) => symbols.some((symbol) => symbol === term || symbol.includes(term)));
  return Math.min(24, matches.length * 12);
}

export function dependencyChainWeight(context: ContextPackage, filePath: string, changed: Set<string>): number {
  if (!changed.size) return 0;
  const adjacency = new Map<string, Set<string>>();
  for (const edge of context.graph.fileEdges) {
    if (edge.isExternal) continue;
    const from = adjacency.get(edge.from) ?? new Set<string>();
    const to = adjacency.get(edge.to) ?? new Set<string>();
    from.add(edge.to);
    to.add(edge.from);
    adjacency.set(edge.from, from);
    adjacency.set(edge.to, to);
  }

  const visited = new Set(changed);
  let frontier = [...changed].sort();
  let score = 0;
  for (const distance of [1, 2]) {
    const next = new Set<string>();
    for (const current of frontier) {
      for (const neighbor of [...(adjacency.get(current) ?? [])].sort()) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.add(neighbor);
      }
    }
    if (next.has(filePath)) score += distance === 1 ? 8 : 3;
    frontier = [...next].sort();
  }
  return Math.min(20, score);
}

function regressionWeight(filePath: string, text: string): number {
  return /regression|known-issues|historical|fragile/i.test(`${filePath} ${text}`) ? 10 : 0;
}

function negativeExamplePenalty(filePath: string, text: string, task: string): number {
  return /negative|unrelated|fixture|example/i.test(`${filePath} ${text}`) && !task.toLowerCase().includes(filePath.toLowerCase()) ? 8 : 0;
}

export function sortHits<T extends { score: number; path: string }>(hits: T[]): T[] {
  return [...hits].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}
