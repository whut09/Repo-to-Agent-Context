export type RetrieverProvider = "static" | "ripgrep" | "hybrid" | "lightrag" | "embedding" | "codegraph";
export type RetrievalTaskType = "bugfix" | "feature" | "refactor" | "auto";

export interface RetrievalScoreBreakdown {
  [signal: string]: number;
  lexical: number;
  path: number;
  changed: number;
  importance: number;
  taskType: number;
  symbol: number;
  dependencyChain: number;
  regressionMemory: number;
  negativeExample: number;
  total: number;
}

export interface ContextRetrieverOptions {
  topK: number;
  taskType?: RetrievalTaskType;
  modules?: string[];
  changedFiles?: string[];
  includeTests?: boolean;
}

export function adaptiveTopK(taskType: RetrievalTaskType = "auto", requested?: number): number {
  if (requested !== undefined && Number.isInteger(requested) && requested > 0) return requested;
  const defaults: Record<RetrievalTaskType, number> = {
    bugfix: 6,
    feature: 8,
    refactor: 10,
    auto: 8
  };
  return defaults[taskType];
}

export interface ContextHit {
  id: string;
  path: string;
  title: string;
  moduleName: string;
  kind: string;
  score: number;
  source: RetrieverProvider;
  snippet: string;
  metadata: Record<string, unknown> & { scoreBreakdown?: RetrievalScoreBreakdown };
}

export interface ContextRetriever {
  readonly name: RetrieverProvider;
  search(task: string, options: ContextRetrieverOptions): Promise<ContextHit[]>;
}
