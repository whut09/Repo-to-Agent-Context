import type { ContextEntry } from "../context-registry/types.js";
import type { RetrievalScoreBreakdown, RetrievalTaskType } from "../retrievers/types.js";
import type { DependencyGraph, IndexedFile, RepoIndex, RepoScan } from "./types.js";

export function rankFiles(scan: RepoScan, index: RepoIndex, graph: DependencyGraph): IndexedFile[] {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of graph.fileEdges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    if (!edge.isExternal) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const entrypoints = new Set(scan.entrypoints);
  const sourceFileCount = index.files.filter((file) => file.kind === "source").length;
  const smallRepo = scan.files.length <= 12 || sourceFileCount <= 4;
  const hasSourceFiles = sourceFileCount > 0;

  for (const file of index.files) {
    const reasons: string[] = [];
    let score = 0;
    if (entrypoints.has(file.path)) {
      score += 35;
      reasons.push("entrypoint");
    }
    if (isApiOrRouteFile(file.path)) {
      score += 18;
      reasons.push("route/api surface");
    }
    if (file.kind === "config") {
      score += isHighSignalConfig(file.path) ? 22 : 8;
      reasons.push("configuration");
    }
    if (file.path.toLowerCase().includes("readme")) {
      score += 20;
      reasons.push("readme");
    }
    if (isArchitectureDoc(file.path)) {
      score += 18;
      reasons.push("architecture doc");
    }
    if (file.exports.length) {
      score += Math.min(20, file.exports.length * 4);
      reasons.push(`${file.exports.length} export${file.exports.length === 1 ? "" : "s"}`);
    }
    if (file.symbols.length) {
      score += Math.min(15, file.symbols.length * 2);
      reasons.push(`${file.symbols.length} symbol${file.symbols.length === 1 ? "" : "s"}`);
    }
    const inbound = incoming.get(file.path) ?? 0;
    const outbound = outgoing.get(file.path) ?? 0;
    if (inbound) {
      score += Math.min(25, inbound * 5);
      reasons.push(`${inbound} inbound ${dependencyWord(inbound)}`);
    }
    if (outbound) {
      score += Math.min(15, outbound * 2);
      reasons.push(`${outbound} outbound ${dependencyWord(outbound)}`);
    }
    if (file.isTest) {
      score += 8;
      reasons.push("test coverage signal");
    }
    if (file.confidence === "high") {
      score += 5;
      reasons.push("high-confidence analysis");
    } else if (file.confidence === "low") {
      score -= 5;
      reasons.push("low-confidence analysis");
    }
    if (file.kind === "lockfile" || file.isGenerated || file.kind === "asset") {
      score -= 30;
      reasons.push("low-value generated/asset/lockfile");
    }
    if (isGenericConfig(file)) {
      score -= 8;
      reasons.push("generic config");
    }
    if (isToolingConfig(file.path)) {
      score -= 10;
      reasons.push("tooling config");
    }
    if (file.kind === "docs" && !isArchitectureDoc(file.path) && !file.path.toLowerCase().includes("readme")) {
      score -= 4;
      reasons.push("secondary documentation");
    }
    if (smallRepo && hasSourceFiles && isPackageManifest(file.path)) {
      score -= 12;
      reasons.push("small-repo manifest balance");
    }
    if (smallRepo && hasSourceFiles && file.kind === "config" && !isManifestOrDeploymentConfig(file.path)) {
      score -= 14;
      reasons.push("small-repo config balance");
    }
    if (smallRepo && hasSourceFiles && isToolingConfig(file.path)) {
      score -= 12;
      reasons.push("small-repo tooling balance");
    }
    if (smallRepo && hasSourceFiles && file.kind === "docs" && !isArchitectureDoc(file.path)) {
      score -= file.path.toLowerCase().includes("readme") ? 8 : 12;
      reasons.push("small-repo docs balance");
    }
    file.importanceScore = Math.max(0, score);
    file.importanceReasons = reasons;
  }

  const moduleScores = new Map<string, number>();
  for (const file of index.files) moduleScores.set(file.moduleName, (moduleScores.get(file.moduleName) ?? 0) + file.importanceScore);
  for (const module of index.modules) module.importanceScore = moduleScores.get(module.name) ?? 0;
  return [...index.files].filter((file) => file.importanceScore > 0).sort((a, b) => b.importanceScore - a.importanceScore || a.path.localeCompare(b.path));
}

function dependencyWord(count: number): string {
  return count === 1 ? "dependency" : "dependencies";
}
function isApiOrRouteFile(filePath: string): boolean {
  return /(^|\/)(api|routes?)\//i.test(filePath) || /(^|\/)(route|controller|handler)\.[cm]?[tj]sx?$/i.test(filePath);
}
function isArchitectureDoc(filePath: string): boolean {
  return /(^|\/)(architecture|design|adr|decision[s]?)(\.|\/|$)/i.test(filePath);
}
function isHighSignalConfig(filePath: string): boolean {
  return /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile|docker-compose\.yml|docker-compose\.yaml|next\.config\.[cm]?js|vite\.config\.[cm]?ts)$/i.test(
    filePath
  );
}
function isGenericConfig(file: IndexedFile): boolean {
  return file.kind === "config" && !isHighSignalConfig(file.path);
}
function isToolingConfig(filePath: string): boolean {
  return /(^|\/)(tsconfig\.json|eslint\.config\.[cm]?js|prettier\.config\.[cm]?js|babel\.config\.[cm]?js|vitest\.config\.[cm]?ts|jest\.config\.[cm]?js)$/i.test(
    filePath
  );
}
function isManifestOrDeploymentConfig(filePath: string): boolean {
  return /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile|docker-compose\.yml|docker-compose\.yaml|pm2\.config\.[cm]?js|ecosystem\.config\.[cm]?js)$/i.test(
    filePath
  );
}
function isPackageManifest(filePath: string): boolean {
  return /(^|\/)package\.json$/i.test(filePath);
}

export interface ContextRegistryRankOptions {
  taskType?: RetrievalTaskType;
  packageVersion?: string;
  language?: string;
  source?: string;
  tags?: string[];
  negativeExamples?: string[];
  localQualitySignals?: Record<string, number>;
}

export interface RankedContextEntry {
  entry: ContextEntry;
  score: number;
  scoreBreakdown: RetrievalScoreBreakdown;
  exactId: boolean;
}

export function rankContextEntriesForTask(task: string, entries: ContextEntry[], options: ContextRegistryRankOptions = {}): RankedContextEntry[] {
  const terms = tokenize(task);
  return entries
    .filter((entry) => matchesEntryFilters(entry, options))
    .map((entry) => rankContextEntry(task, terms, entry, options))
    .sort(compareRankedEntries);
}

export function rankContextEntry(task: string, terms: string[], entry: ContextEntry, options: ContextRegistryRankOptions = {}): RankedContextEntry {
  const normalizedTask = task.trim().toLowerCase();
  const ids = [entry.id, entry.canonicalId, `${entry.sourceName}:${entry.canonicalId ?? entry.id}`, entry.name]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  const exactId = normalizedTask.length > 0 && ids.includes(normalizedTask);
  const lexical =
    fieldScore(terms, entry.id, 28) +
    fieldScore(terms, entry.canonicalId, 24) +
    fieldScore(terms, entry.name, 20) +
    fieldScore(terms, entry.tags.join(" "), 9) +
    fieldScore(terms, entry.description, 6) +
    fieldScore(terms, entry.files.map((file) => file.path).join(" "), 4);
  const symbol = fieldScore(terms, (entry.symbols ?? []).join(" "), 14);
  const dependency = fieldScore(terms, (entry.dependencyChain ?? []).join(" "), 10);
  const source = sourceWeight(entry.trustLevel);
  const quality = Math.min(10, entry.qualityScore ?? qualityScore(entry));
  const localFeedback = Math.max(-3, Math.min(3, options.localQualitySignals?.[feedbackKey(entry)] ?? 0));
  const regression = regressionWeight(terms, entry);
  const negativePenalty = negativePenaltyForEntry(entry, options.negativeExamples ?? []);
  const exactBoost = exactId ? 1000 : 0;
  const taskType = taskTypeWeight(options.taskType, entry.kind);
  const score = exactBoost + lexical + symbol + dependency + source + quality + localFeedback + regression + taskType - negativePenalty;
  const scoreBreakdown: RetrievalScoreBreakdown = {
    lexical,
    path: 0,
    changed: 0,
    importance: quality,
    taskType,
    symbol,
    dependencyChain: dependency,
    regressionMemory: regression,
    negativeExample: negativePenalty,
    negativePenalty,
    dependency,
    source,
    quality,
    localFeedback,
    regression,
    exactId: exactBoost,
    total: score
  };
  return { entry, score, scoreBreakdown, exactId };
}

export function contextEntryFeedbackKey(entry: Pick<ContextEntry, "sourceName" | "id">): string {
  return `${entry.sourceName}\0${entry.id}`;
}

function feedbackKey(entry: ContextEntry): string {
  return contextEntryFeedbackKey(entry);
}

export function matchesEntryFilters(entry: ContextEntry, options: ContextRegistryRankOptions): boolean {
  if (options.packageVersion && entry.packageVersion !== options.packageVersion) return false;
  if (options.language && entry.language !== options.language) return false;
  if (options.source && entry.sourceName !== options.source) return false;
  if (options.tags?.length && !options.tags.every((tag) => entry.tags.some((entryTag) => entryTag.toLowerCase() === tag.toLowerCase()))) return false;
  return true;
}

export function tokenize(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .match(/[\p{L}\p{N}_/-]+/gu)
        ?.filter((term) => term.length >= 2) ?? []
    )
  ];
}

function fieldScore(terms: string[], field: string | undefined, weight: number): number {
  if (!field || !terms.length) return 0;
  const normalized = field.toLowerCase();
  return terms.reduce((score, term) => score + (normalized === term ? weight * 1.5 : normalized.includes(term) ? weight : 0), 0);
}

function sourceWeight(trustLevel: ContextEntry["trustLevel"]): number {
  return { official: 5, maintainer: 4, private: 3, community: 2, untrusted: 0 }[trustLevel];
}

function qualityScore(entry: ContextEntry): number {
  return Math.min(10, Math.log2(Math.max(1, entry.contentRevision)) + Math.min(4, entry.files.length) + (entry.description.length >= 40 ? 2 : 0));
}

function regressionWeight(terms: string[], entry: ContextEntry): number {
  return terms.some((term) => entry.tags.some((tag) => tag.toLowerCase().includes(term)) || entry.name.toLowerCase().includes(term)) ? 2 : 0;
}

function negativePenaltyForEntry(entry: ContextEntry, negativeExamples: string[]): number {
  const values = [entry.id, entry.canonicalId, entry.name, ...entry.files.map((file) => file.path)].filter(Boolean).map((value) => value!.toLowerCase());
  return negativeExamples.some((negative) => values.some((value) => value === negative.toLowerCase() || value.startsWith(`${negative.toLowerCase()}/`)))
    ? 40
    : 0;
}

function taskTypeWeight(taskType: RetrievalTaskType | undefined, kind: ContextEntry["kind"]): number {
  if (taskType === "bugfix" && kind === "doc") return 2;
  if (taskType === "feature" && kind === "skill") return 2;
  if (taskType === "refactor" && kind === "reference") return 2;
  return 0;
}

function compareRankedEntries(left: RankedContextEntry, right: RankedContextEntry): number {
  return right.score - left.score || (right.exactId === left.exactId ? left.entry.id.localeCompare(right.entry.id) : right.exactId ? 1 : -1);
}
