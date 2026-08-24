export type AgentTarget = "opencode" | "codex" | "claude" | "cursor" | "all";
export type AgentsMode = "minimal" | "balanced" | "full";
export type AgentsSection = "commands" | "safety" | "entrypoints" | "contextLinks";
export type TokenizerMode = "chars_approx" | "cl100k_base" | "o200k_base";
export type AnalysisConfidence = "high" | "medium" | "low";
export type TaskType = "bugfix" | "feature" | "refactor" | "auto";
export type EvidencePolicyMode = "advisory" | "balanced" | "strict";

export interface OpenCodePlusplusConfig {
  target: AgentTarget;
  evidencePolicy: EvidencePolicyMode;
  tokenBudget: number;
  include: string[];
  exclude: string[];
  llm: LlmConfig;
  rag: RagConfig;
  tokenizer: TokenizerConfig;
  agents: AgentsConfig;
  outputs: {
    agents: boolean;
    modules: boolean;
    graph: boolean;
    tasks: boolean;
    readiness: boolean;
    rag: boolean;
  };
}

export interface AgentsConfig {
  mode: AgentsMode;
  maxTokens: number;
  include: AgentsSection[];
  manualSources: string[];
}

export interface LlmConfig {
  enabled: boolean;
  provider: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface RagConfig {
  provider: "lightrag";
  chunkTokenLimit: number;
}

export interface TokenizerConfig {
  mode: TokenizerMode;
  model?: string;
}

export interface RepoScan {
  root: string;
  files: RepoFile[];
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  configFiles: string[];
  entrypoints: string[];
  testCommands: string[];
  runCommands: string[];
  lintCommands: string[];
  typecheckCommands: string[];
  ciFiles: string[];
  envExampleFiles: string[];
  migrationFiles: string[];
}

export interface RepoFile {
  path: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  kind: FileKind;
  language: string | null;
  tokenEstimate: number;
  isBinary: boolean;
  isGenerated: boolean;
  isTest: boolean;
}

export type FileKind = "source" | "test" | "config" | "docs" | "lockfile" | "asset" | "generated" | "unknown";

export interface RepoIndex {
  files: IndexedFile[];
  symbols: SymbolInfo[];
  imports: ImportEdge[];
  modules: ModuleInfo[];
}

export interface IndexedFile extends RepoFile {
  imports: ImportRef[];
  exports: string[];
  symbols: SymbolInfo[];
  summary: string;
  analyzer: string;
  confidence: AnalysisConfidence;
  analysisStats: AnalysisStats;
  evidence: AnalysisEvidence[];
  moduleName: string;
  importanceScore: number;
  importanceReasons: string[];
}

export interface ImportRef {
  specifier: string;
  resolvedPath: string | null;
  isExternal: boolean;
}

export interface ImportEdge {
  from: string;
  to: string;
  specifier: string;
  isExternal: boolean;
}

export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "export" | "route" | "fixture" | "enum" | "namespace" | "unknown";
  filePath: string;
  line: number;
}

export interface AnalysisStats {
  parser: "typescript-compiler-api" | "tree-sitter-python" | "python-ast" | "regex-fallback" | "generic";
  importsResolved: number;
  importsUnresolved: number;
  symbolsDetected: number;
  routesDetected: number;
}

export interface AnalysisEvidence {
  line: number;
  kind: "import" | "export" | "symbol" | "route" | "structure";
  symbol?: string;
  detail: string;
}

export interface ModuleInfo {
  name: string;
  pathPrefix: string;
  files: string[];
  imports: string[];
  summary: string;
  importanceScore: number;
}

export interface DependencyGraph {
  fileEdges: ImportEdge[];
  moduleEdges: Array<{
    from: string;
    to: string;
    count: number;
  }>;
}

export interface ContextPackage {
  config: OpenCodePlusplusConfig;
  scan: RepoScan;
  index: RepoIndex;
  graph: DependencyGraph;
  keyFiles: IndexedFile[];
  target: AgentTarget;
  readiness: AgentReadinessReport;
  summaries: SummaryBundle;
  tokenSavings: TokenSavingsReport;
  cacheStats: CacheStats;
}

export interface CacheStats {
  enabled: boolean;
  fileHashHits: number;
  fileHashMisses: number;
  indexHits: number;
  indexMisses: number;
  graphHits: number;
  graphMisses: number;
  tokenHits: number;
  tokenMisses: number;
  prunedFileHashes: number;
  prunedIndexEntries: number;
  dependencyInvalidated: boolean;
}

export interface SummaryBundle {
  mode: "offline" | "llm";
  llmAttempted: boolean;
  fallbackReason?: "disabled" | "missing_configuration" | "request_failed";
  repoSummary: string;
  moduleSummaries: Array<{
    moduleName: string;
    summary: string;
    evidence: string[];
  }>;
}

export interface AgentReadinessReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  missing: string[];
  strengths: string[];
  dimensions: ReadinessDimension[];
  categories: ReadinessCategory[];
  capsApplied: ReadinessCap[];
}

export interface ReadinessCategory {
  category: "structure" | "commands" | "tests" | "architecture" | "task-context" | "safety";
  score: number;
  evidence: string[];
  missing: string[];
}

export interface ReadinessDimension {
  category: "operational" | "context-quality" | "agent-safety";
  score: number;
  evidence: string[];
  missing: string[];
}

export interface ReadinessCap {
  cap: number;
  applied: boolean;
  reason: string;
  evidence: string[];
}

export interface TokenSavingsReport {
  tokenBudget: number;
  originalTokens: number;
  contextPackTokenEstimate: number;
  contextPackTokens: TokenCountSummary | ActualOutputTokenReport;
  compressionRatio: number;
  withinBudget: boolean;
  selectedFiles: number;
  totalFiles: number;
  estimatedTokenSavings: number;
  originalRepoTokens: TokenCountSummary;
  estimatedContextPackTokens: TokenCountSummary;
  contextPackTokenSummary?: ActualOutputTokenReport;
  actualOutputTokens?: ActualOutputTokenReport;
}

export interface ActualOutputTokenReport {
  mode: "actual";
  tokenizer: TokenizerMode;
  model?: string;
  totalTokens: number;
  total: number;
  scope: string;
  files: Record<string, number>;
}

export interface TokenCountSummary {
  mode: "estimated";
  tokenizer: TokenizerMode;
  model?: string;
  tokens: number;
}

export interface TaskPack {
  task: string;
  type: Exclude<TaskType, "auto">;
  tokenBudget: number;
  estimatedTokens: number;
  remainingBudget: number;
  files: TaskPackFile[];
  readFirst: TaskPackFile[];
  inspectIfNeeded: TaskPackFile[];
  budget: {
    total: number;
    used: number;
    remaining: number;
    buckets: Array<{
      name: "direct-source" | "tests" | "dependency-neighbors" | "config-docs" | "entrypoints";
      label: string;
      tokens: number;
      files: string[];
    }>;
  };
  suggestedCommands: string[];
  regression: {
    matchedIssues: number;
    antiRegressionNotes: string[];
    requiredTests: string[];
  };
  retrieval: {
    directMatches: number;
    dependencyNeighbors: number;
    tests: number;
    configDocs: number;
  };
}

export interface TaskPackFile {
  path: string;
  score: number;
  reasons: string[];
  category: "direct-source" | "test" | "dependency-neighbor" | "config-doc" | "entrypoint";
  estimatedTokens: number;
}
