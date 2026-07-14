import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ContextPackage, EvidencePolicyMode } from "../../../core/types.js";
import { changedFilesSince, runGit } from "../../../core/git.js";
import { currentWorkingTreeHash, readExecutionTrace, traceIdForTask } from "../../observability/execution-trace.js";
import { evidenceSatisfies, type EvidenceResult } from "../../../outputs/evidence.js";
import { bullet, code, heading, table } from "../../../outputs/renderers/markdown.js";
import type { GuardResult } from "../../types.js";
import { createGuardResult } from "../../types.js";

export interface RegressionMemoryEntry {
  id: string;
  module: string;
  files: string[];
  pattern: string;
  requiredTests: string[];
  riskTriggers: string[];
  lastFixedIn?: string;
  severity?: "error" | "warning";
}

export interface RegressionGuardOptions {
  base?: string;
  task?: string;
  traceId?: string;
  changedFiles?: string[];
  evidencePolicy?: EvidencePolicyMode;
}

export interface RegressionMatch {
  id: string;
  source: "known-issues" | "fix-history" | "fragile-modules" | "anti-regression-tests";
  module: string;
  files: string[];
  pattern: string;
  requiredTests: string[];
  riskTriggers: string[];
  lastFixedIn?: string;
  matchedBy: string[];
  severity: "error" | "warning";
}

export interface RegressionGuardReport {
  taskId: string;
  task?: string;
  base: string;
  traceId?: string;
  traceLoaded: boolean;
  changedFiles: string[];
  affectedModules: string[];
  summary: {
    matches: number;
    requiredTests: number;
    missingRequiredTestEvidence: number;
  };
  matches: RegressionMatch[];
  requiredTests: string[];
  evidence: EvidenceResult;
  notes: string[];
  results: GuardResult[];
}

const MEMORY_FILES: Array<{ source: RegressionMatch["source"]; file: string }> = [
  { source: "known-issues", file: "known-issues.json" },
  { source: "fix-history", file: "fix-history.json" },
  { source: "fragile-modules", file: "fragile-modules.json" },
  { source: "anti-regression-tests", file: "anti-regression-tests.json" }
];

export function buildRegressionReport(context: ContextPackage, options: RegressionGuardOptions = {}): RegressionGuardReport {
  const base = options.base ?? "main";
  const task = options.task;
  const trace = options.traceId ? readExecutionTrace(context.scan.root, options.traceId) : null;
  const taskId = options.traceId ?? (task ? traceIdForTask(task) : "regression-check");
  const changedFiles = options.changedFiles ?? changedFilesForRegression(context, base);
  const affectedModules = modulesForFiles(context, changedFiles);
  const taskTerms = taskTermsFor(task);
  const entries = readRegressionMemory(context);
  const matches = entries
    .map((entry) => matchRegressionEntry(entry, { taskTerms, changedFiles, affectedModules }))
    .filter((match): match is RegressionMatch => Boolean(match));
  const requiredTests = dedupe(matches.flatMap((match) => match.requiredTests)).filter((command) => command.trim());
  const evidence = evidenceSatisfies(
    {
      kind: "tests",
      currentRepoHash: currentWorkingTreeHash(context.scan.root),
      requiredCommands: requiredTests,
      policy: options.evidencePolicy ?? context.config.evidencePolicy,
      sourceChanged: changedFiles.length > 0
    },
    trace
  );
  const missingRequiredTestEvidence = requiredTests.length && !evidence.satisfied ? requiredTests.length : 0;
  const results = matches.map((match) => regressionMatchToResult(match, missingRequiredTestEvidence > 0));
  return {
    taskId,
    task,
    base,
    traceId: options.traceId,
    traceLoaded: Boolean(trace),
    changedFiles,
    affectedModules,
    summary: {
      matches: matches.length,
      requiredTests: requiredTests.length,
      missingRequiredTestEvidence
    },
    matches,
    requiredTests,
    evidence,
    notes: matches.flatMap(regressionNotesFor),
    results
  };
}

export function ensureRegressionMemory(context: ContextPackage): string[] {
  const dir = regressionDir(context.scan.root);
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const item of MEMORY_FILES) {
    if (item.file === "fix-history.json") continue;
    const filePath = path.join(dir, item.file);
    if (existsSync(filePath)) continue;
    writeFileSync(filePath, "[]\n", "utf8");
    written.push(filePath);
  }
  return written;
}

export function writeRegressionReport(context: ContextPackage, report: RegressionGuardReport): { json: string; markdown: string } {
  ensureRegressionMemory(context);
  const root = context.scan.root;
  const reportPath = path.join(regressionDir(root), `${report.taskId}.json`);
  const runDir = path.join(root, ".agent-context", "runs", report.taskId);
  mkdirSync(runDir, { recursive: true });
  const markdownPath = path.join(runDir, "regression.md");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, `${renderRegressionReport(report)}\n`, "utf8");
  return {
    json: path.relative(root, reportPath).replaceAll("\\", "/"),
    markdown: path.relative(root, markdownPath).replaceAll("\\", "/")
  };
}

export function renderRegressionReport(report: RegressionGuardReport): string {
  return [
    heading(1, "Regression Guard"),
    "",
    `Task ID: ${report.taskId}`,
    report.task ? `Task: ${report.task}` : "Task: unknown",
    `Base: ${report.base}`,
    report.traceId ? `Trace: ${report.traceId} (${report.traceLoaded ? "loaded" : "missing"})` : "Trace: none",
    "",
    heading(2, "Summary"),
    table(
      ["Signal", "Count"],
      [
        ["Matched memory entries", String(report.summary.matches)],
        ["Required regression tests", String(report.summary.requiredTests)],
        ["Missing required test evidence", String(report.summary.missingRequiredTestEvidence)]
      ]
    ),
    "",
    heading(2, "Matched Issues"),
    bullet(report.matches.map(formatRegressionMatch)),
    "",
    heading(2, "Anti-Regression Notes"),
    bullet(report.notes),
    "",
    heading(2, "Required Regression Tests"),
    bullet(report.requiredTests.map(code)),
    "",
    heading(2, "Evidence"),
    bullet(report.evidence.evidence)
  ].join("\n");
}

function regressionMatchToResult(match: RegressionMatch, missingEvidence: boolean): GuardResult {
  const blocking = missingEvidence || match.severity === "error";
  return createGuardResult({
    id: `regression.${match.id}`,
    source: "regression",
    kind: blocking ? "required" : "risk",
    status: missingEvidence ? "missing" : "warning",
    severity: blocking ? "required" : "warning",
    message: match.pattern,
    blocking,
    confidence: blocking ? 0.86 : 0.68,
    reasons: match.matchedBy,
    requiredCommands: missingEvidence ? match.requiredTests : [],
    artifacts: [],
    evidence: match.matchedBy
  });
}

function readRegressionMemory(context: ContextPackage): RegressionMatch[] {
  const dir = regressionDir(context.scan.root);
  const entries: RegressionMatch[] = [];
  for (const item of MEMORY_FILES) {
    const filePath = path.join(dir, item.file);
    if (!existsSync(filePath)) continue;
    for (const entry of readMemoryFile(filePath)) {
      entries.push({
        ...entry,
        source: item.source,
        matchedBy: [],
        severity: entry.severity ?? "warning"
      });
    }
  }
  return entries;
}

function readMemoryFile(filePath: string): RegressionMemoryEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map(normalizeEntry).filter((entry): entry is RegressionMemoryEntry => Boolean(entry));
  } catch {
    return [];
  }
}

function normalizeEntry(value: unknown): RegressionMemoryEntry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id);
  const module = stringValue(record.module);
  const pattern = stringValue(record.pattern);
  if (!id || !module || !pattern) return undefined;
  return {
    id,
    module,
    pattern,
    files: stringArray(record.files),
    requiredTests: stringArray(record.requiredTests),
    riskTriggers: stringArray(record.riskTriggers),
    lastFixedIn: stringValue(record.lastFixedIn),
    severity: record.severity === "error" ? "error" : record.severity === "warning" ? "warning" : undefined
  };
}

function matchRegressionEntry(
  entry: RegressionMatch,
  input: { taskTerms: Set<string>; changedFiles: string[]; affectedModules: string[] }
): RegressionMatch | undefined {
  const matchedBy: string[] = [];
  for (const file of entry.files) {
    if (input.changedFiles.includes(file)) matchedBy.push(`changed file: ${file}`);
  }
  if (input.affectedModules.includes(entry.module)) matchedBy.push(`affected module: ${entry.module}`);
  for (const trigger of entry.riskTriggers) {
    const normalized = normalizeTerm(trigger);
    if (normalized && input.taskTerms.has(normalized)) matchedBy.push(`task trigger: ${trigger}`);
  }
  for (const term of taskTermsFor(entry.pattern)) {
    if (input.taskTerms.has(term)) matchedBy.push(`pattern term: ${term}`);
  }
  if (!matchedBy.length) return undefined;
  return { ...entry, matchedBy: dedupe(matchedBy) };
}

function regressionNotesFor(match: RegressionMatch): string[] {
  return [
    `${match.id}: ${match.pattern}`,
    `Module: ${match.module}; files: ${match.files.join(", ") || "none configured"}`,
    match.lastFixedIn ? `Last fixed in: ${match.lastFixedIn}` : "",
    match.riskTriggers.length ? `Risk triggers: ${match.riskTriggers.join(", ")}` : ""
  ].filter(Boolean);
}

function changedFilesForRegression(context: ContextPackage, base: string): string[] {
  const files = new Set<string>();
  try {
    for (const file of changedFilesSince(context.scan.root, base)) files.add(file);
  } catch {
    // Regression memory still works from task text in non-git repos.
  }
  try {
    for (const line of runGit(context.scan.root, ["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/)) {
      if (line.length <= 3) continue;
      const file = line.slice(3).trim().replace(/\\/g, "/").split(" -> ").pop();
      if (file && !file.startsWith(".agent-context/") && file !== "AGENTS.md") files.add(file);
    }
  } catch {
    // Keep command usable outside git.
  }
  return [...files].sort();
}

function modulesForFiles(context: ContextPackage, files: string[]): string[] {
  const indexed = new Map(context.index.files.map((file) => [file.path, file]));
  const modules = new Set<string>();
  for (const file of files) {
    const indexedFile = indexed.get(file);
    if (indexedFile?.moduleName && indexedFile.moduleName !== "root") modules.add(indexedFile.moduleName);
    const module = context.index.modules.find((item) => file.startsWith(item.pathPrefix));
    if (module?.name && module.name !== "root") modules.add(module.name);
  }
  return [...modules].sort();
}

function taskTermsFor(value: string | undefined): Set<string> {
  const terms = new Set<string>();
  for (const raw of value?.match(/[\p{L}\p{N}_/-]+/gu) ?? []) {
    const term = normalizeTerm(raw);
    if (term && term.length >= 2) terms.add(term);
  }
  return terms;
}

function normalizeTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_\-/\p{L}\p{N}]+/gu, "");
}

function regressionDir(root: string): string {
  return path.join(root, ".agent-context", "regression");
}

function formatRegressionMatch(match: RegressionMatch): string {
  return `${match.severity.toUpperCase()} ${match.id} (${match.source}) - ${match.pattern}. Matched by: ${match.matchedBy.join("; ")}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)].sort();
}
