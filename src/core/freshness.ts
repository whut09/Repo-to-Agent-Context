import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ContextPackage } from "./types.js";
import { runGit } from "./git.js";
import { buildRepoContracts } from "../outputs/contracts.js";
import { buildTaskPack } from "../outputs/task-context.js";
import { bullet, code, heading } from "../outputs/renderers/markdown.js";
import { OPENCODE_PLUSPLUS_PACKAGE_VERSION } from "./package-info.js";

const MANIFEST_PATH = ".agent-context/manifest.json";

export interface ContextManifest {
  generatedAt: string;
  gitCommit: string | null;
  configHash: string;
  sourceHash: string;
  indexHash: string;
  graphHash: string;
  contractsHash: string;
  taskPacksHash: string;
  generatedOutputHash: string;
  toolVersion: string;
  files: {
    source: number;
    generated: number;
  };
  generatedFiles: Record<string, string>;
}

export interface ContextFreshnessReport {
  status: "fresh" | "stale" | "missing";
  generatedAt?: string;
  gitCommit?: string | null;
  currentGitCommit: string | null;
  changedFilesSinceGeneration: string[];
  reasons: string[];
  recommended: string;
  checks: Array<{
    name: string;
    passed: boolean;
    expected?: string | null;
    actual?: string | null;
    detail: string;
  }>;
}

export interface ContextDriftReport {
  status: "clean" | "drift" | "missing";
  freshness: ContextFreshnessReport;
  reasons: string[];
  recommended: string;
  checks: ContextFreshnessReport["checks"];
}

export function buildContextManifest(context: ContextPackage, generatedFiles: string[] = [], generatedAt = new Date()): ContextManifest {
  const normalized = manifestContext(context);
  const relativeGenerated = [...new Set(generatedFiles)]
    .map((filePath) => path.relative(context.scan.root, filePath).replaceAll("\\", "/"))
    .filter((filePath) => filePath !== MANIFEST_PATH)
    .sort();

  const generatedFileHashes = Object.fromEntries(
    relativeGenerated
      .map((filePath) => [filePath, hashFile(path.join(context.scan.root, filePath))] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );

  return {
    generatedAt: generatedAt.toISOString(),
    gitCommit: currentGitCommit(context.scan.root),
    configHash: hashValue(sanitizeConfig(normalized.config)),
    sourceHash: sourceHash(normalized),
    indexHash: indexHash(normalized),
    graphHash: hashValue(normalized.graph),
    contractsHash: contractsHash(normalized),
    taskPacksHash: taskPacksHash(normalized),
    generatedOutputHash: hashValue(generatedFileHashes),
    toolVersion: OPENCODE_PLUSPLUS_PACKAGE_VERSION,
    files: {
      source: normalized.scan.files.length,
      generated: Object.keys(generatedFileHashes).length
    },
    generatedFiles: generatedFileHashes
  };
}

export function readContextManifest(root: string): ContextManifest | null {
  const filePath = path.join(root, MANIFEST_PATH);
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as ContextManifest;
  } catch {
    return null;
  }
}

export function assessFreshness(context: ContextPackage): ContextFreshnessReport {
  const manifest = readContextManifest(context.scan.root);
  const currentCommit = currentGitCommit(context.scan.root);
  if (!manifest) {
    return {
      status: "missing",
      currentGitCommit: currentCommit,
      changedFilesSinceGeneration: [],
      reasons: ["No .agent-context/manifest.json found."],
      recommended: "opencode-plusplus build .",
      checks: [
        {
          name: "manifest",
          passed: false,
          detail: "No generated context manifest exists yet."
        }
      ]
    };
  }

  const current = buildContextManifest(context, []);
  const changedFiles = changedFilesSinceManifest(context.scan.root, manifest);
  const sourceChanged = manifest.sourceHash !== current.sourceHash;
  const generatedFiles = generatedFileChecks(context.scan.root, manifest);
  const checks: ContextFreshnessReport["checks"] = [
    check(
      "git commit",
      manifest.gitCommit === currentCommit || !sourceChanged,
      manifest.gitCommit,
      currentCommit,
      sourceChanged ? "Context was generated from the current git commit." : "Source hash matches; git commit is informational."
    ),
    check(
      "source hash",
      manifest.sourceHash === current.sourceHash,
      manifest.sourceHash,
      current.sourceHash,
      "Scanned source files match the generated context."
    ),
    check("config hash", manifest.configHash === current.configHash, manifest.configHash, current.configHash, "Config inputs match the generated context."),
    check("index hash", manifest.indexHash === current.indexHash, manifest.indexHash, current.indexHash, "Code index matches current analysis."),
    check(
      "dependency graph hash",
      manifest.graphHash === current.graphHash,
      manifest.graphHash,
      current.graphHash,
      "Dependency graph matches current analysis."
    ),
    check(
      "contracts hash",
      manifest.contractsHash === current.contractsHash,
      manifest.contractsHash,
      current.contractsHash,
      "Generated contracts match current repository structure."
    ),
    check(
      "task packs hash",
      manifest.taskPacksHash === current.taskPacksHash,
      manifest.taskPacksHash,
      current.taskPacksHash,
      "Default task packs match current repository structure."
    ),
    ...generatedFiles
  ];
  const reasons = checks.filter((item) => !item.passed).map((item) => item.detail);
  if (sourceChanged && changedFiles.length) {
    reasons.push(`${changedFiles.length} files changed since context generation.`);
  }

  return {
    status: reasons.length ? "stale" : "fresh",
    generatedAt: manifest.generatedAt,
    gitCommit: manifest.gitCommit,
    currentGitCommit: currentCommit,
    changedFilesSinceGeneration: sourceChanged ? changedFiles : [],
    reasons,
    recommended: reasons.length ? "opencode-plusplus update ." : "No action needed.",
    checks
  };
}

export function assessDrift(context: ContextPackage): ContextDriftReport {
  const freshness = assessFreshness(context);
  if (freshness.status === "missing") {
    return {
      status: "missing",
      freshness,
      reasons: freshness.reasons,
      recommended: "opencode-plusplus build .",
      checks: freshness.checks
    };
  }

  const driftChecks = freshness.checks.filter((item) => ["dependency graph hash", "contracts hash", "task packs hash", "generated files"].includes(item.name));
  const reasons = [
    ...freshness.reasons.filter((reason) => /dependency graph|contracts|task packs|generated file|missing generated/i.test(reason)),
    ...driftChecks.filter((item) => !item.passed && !freshness.reasons.includes(item.detail)).map((item) => item.detail)
  ];

  return {
    status: reasons.length ? "drift" : "clean",
    freshness,
    reasons,
    recommended: reasons.length ? "opencode-plusplus update ." : "No action needed.",
    checks: driftChecks
  };
}

export function renderFreshnessReport(report: ContextFreshnessReport): string {
  return [
    heading(1, "Context Freshness"),
    "",
    `Context freshness: ${report.status}`,
    report.generatedAt ? `Generated at: ${report.generatedAt}` : null,
    `Generated commit: ${report.gitCommit ?? "unknown"}`,
    `Current commit: ${report.currentGitCommit ?? "unknown"}`,
    `Recommended: ${report.recommended}`,
    "",
    heading(2, "Reasons"),
    bullet(report.reasons),
    "",
    heading(2, "Changed Files Since Generation"),
    bullet(report.changedFilesSinceGeneration.slice(0, 50).map(code)),
    "",
    heading(2, "Checks"),
    bullet(report.checks.map((item) => `${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`))
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");
}

export function renderDriftReport(report: ContextDriftReport): string {
  return [
    heading(1, "Context Drift"),
    "",
    `Context drift: ${report.status}`,
    `Freshness: ${report.freshness.status}`,
    `Recommended: ${report.recommended}`,
    "",
    heading(2, "Reasons"),
    bullet(report.reasons),
    "",
    heading(2, "Drift Checks"),
    bullet(report.checks.map((item) => `${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`))
  ].join("\n");
}

function check(name: string, passed: boolean, expected: string | null, actual: string | null, detail: string): ContextFreshnessReport["checks"][number] {
  return { name, passed, expected, actual, detail };
}

function generatedFileChecks(root: string, manifest: ContextManifest): ContextFreshnessReport["checks"] {
  const expectedHash = hashValue(manifest.generatedFiles ?? {});
  const currentHashes: Record<string, string> = {};
  const missing: string[] = [];
  for (const [filePath, expected] of Object.entries(manifest.generatedFiles ?? {})) {
    const actual = hashFile(path.join(root, filePath));
    if (!actual) {
      missing.push(filePath);
      continue;
    }
    currentHashes[filePath] = actual;
    if (actual !== expected) {
      return [check("generated files", false, expectedHash, hashValue(currentHashes), `Generated file changed since build: ${filePath}.`)];
    }
  }
  if (missing.length) {
    return [check("generated files", false, expectedHash, hashValue(currentHashes), `Missing generated file: ${missing[0]}.`)];
  }
  return [check("generated files", true, expectedHash, expectedHash, "Generated output files match the manifest.")];
}

function changedFilesSinceManifest(root: string, manifest: ContextManifest): string[] {
  const commit = manifest.gitCommit;
  if (!commit) return [];
  const files = new Set<string>();
  try {
    for (const file of runGit(root, ["diff", "--name-only", commit]).split(/\r?\n/)) {
      if (file.trim()) files.add(file.trim().replaceAll("\\", "/"));
    }
    for (const file of runGit(root, ["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/)) {
      if (file.trim()) files.add(file.trim().replaceAll("\\", "/"));
    }
  } catch {
    return [];
  }
  const generated = new Set([...Object.keys(manifest.generatedFiles ?? {}), MANIFEST_PATH]);
  return [...files]
    .filter((file) => !file.startsWith(".agent-context/cache/"))
    .filter((file) => !generated.has(file))
    .filter((file) => !(file === "AGENTS.md" && isGeneratedFile(path.join(root, file))))
    .sort();
}

function sourceHash(context: ContextPackage): string {
  return hashValue(
    context.scan.files
      .filter((file) => !(file.path === "AGENTS.md" && isGeneratedFile(file.absolutePath)))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => ({
        path: file.path,
        sizeBytes: file.sizeBytes,
        sha256: file.isBinary ? null : hashFile(file.absolutePath)
      }))
  );
}

function indexHash(context: ContextPackage): string {
  const normalized = manifestContext(context);
  return hashValue({
    files: normalized.index.files.map((file) => ({
      path: file.path,
      imports: sortBy(file.imports, (item) => `${item.specifier}:${item.resolvedPath ?? ""}:${item.isExternal ? "external" : "local"}`),
      exports: [...file.exports].sort(),
      symbols: sortBy(file.symbols, (symbol) => `${symbol.kind}:${symbol.name}:${symbol.line ?? 0}`),
      analyzer: file.analyzer,
      confidence: file.confidence,
      moduleName: file.moduleName
    })),
    modules: normalized.index.modules.map((module) => ({
      name: module.name,
      pathPrefix: module.pathPrefix,
      files: module.files,
      imports: module.imports
    }))
  });
}

function contractsHash(context: ContextPackage): string {
  return hashValue(buildRepoContracts(manifestContext(context)));
}

function taskPacksHash(context: ContextPackage): string {
  const normalized = manifestContext(context);
  return hashValue({
    bugfix: buildTaskPack(normalized, "fix a bug or regression", { type: "bugfix" }),
    feature: buildTaskPack(normalized, "add a feature or new behavior", { type: "feature" }),
    refactor: buildTaskPack(normalized, "refactor code safely", { type: "refactor" })
  });
}

function manifestContext(context: ContextPackage): ContextPackage {
  const excluded = new Set(context.index.files.filter((file) => file.path === "AGENTS.md" && isGeneratedFile(file.absolutePath)).map((file) => file.path));
  const scanFiles = sortBy(
    context.scan.files.filter((file) => !excluded.has(file.path)),
    (file) => file.path
  );
  const indexFiles = sortBy(
    context.index.files.filter((file) => !excluded.has(file.path)),
    (file) => file.path
  );
  const indexSymbols = sortBy(
    context.index.symbols.filter((symbol) => !excluded.has(symbol.filePath)),
    (symbol) => `${symbol.filePath}:${symbol.kind}:${symbol.name}:${symbol.line ?? 0}`
  );
  const indexImports = sortBy(
    context.index.imports.filter((edge) => !excluded.has(edge.from) && !excluded.has(edge.to)),
    (edge) => `${edge.from}:${edge.to}:${edge.specifier}:${edge.isExternal ? "external" : "local"}`
  );

  return {
    ...context,
    scan: {
      ...context.scan,
      files: scanFiles,
      languages: unique(scanFiles.map((file) => file.language).filter((language): language is string => Boolean(language))),
      frameworks: unique(context.scan.frameworks),
      packageManagers: unique(context.scan.packageManagers),
      configFiles: unique(context.scan.configFiles.filter((file) => !excluded.has(file))),
      entrypoints: unique(context.scan.entrypoints.filter((file) => !excluded.has(file))),
      testCommands: unique(context.scan.testCommands),
      runCommands: unique(context.scan.runCommands),
      lintCommands: unique(context.scan.lintCommands),
      typecheckCommands: unique(context.scan.typecheckCommands),
      envExampleFiles: unique(context.scan.envExampleFiles.filter((file) => !excluded.has(file))),
      ciFiles: unique(context.scan.ciFiles.filter((file) => !excluded.has(file))),
      migrationFiles: unique(context.scan.migrationFiles.filter((file) => !excluded.has(file)))
    },
    index: {
      files: indexFiles,
      symbols: indexSymbols,
      imports: indexImports,
      modules: sortBy(context.index.modules, (module) => module.name)
        .map((module) => ({
          ...module,
          files: unique(module.files.filter((file) => !excluded.has(file))),
          imports: unique(module.imports),
          summary: `${module.name} contains ${module.files.filter((file) => !excluded.has(file)).length} file${
            module.files.filter((file) => !excluded.has(file)).length === 1 ? "" : "s"
          }${unique(module.imports).length ? ` and depends on ${unique(module.imports).join(", ")}` : ""}.`
        }))
        .filter((module) => module.files.length > 0)
    },
    graph: {
      fileEdges: indexImports,
      moduleEdges: sortBy(context.graph.moduleEdges, (edge) => `${edge.from}:${edge.to}:${edge.count}`)
    },
    keyFiles: sortBy(
      context.keyFiles.filter((file) => !excluded.has(file.path)),
      (file) => `${String(999999 - file.importanceScore).padStart(6, "0")}:${file.path}`
    )
  };
}

function currentGitCommit(root: string): string | null {
  try {
    return runGit(root, ["rev-parse", "HEAD"]).trim();
  } catch {
    return null;
  }
}

function sanitizeConfig(config: ContextPackage["config"]): Record<string, unknown> {
  return {
    ...config,
    llm: {
      enabled: config.llm.enabled,
      provider: config.llm.provider,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      hasBaseUrl: Boolean(config.llm.baseUrl && config.llm.baseUrl !== "xx"),
      hasApiKey: Boolean(config.llm.apiKey && config.llm.apiKey !== "xx"),
      hasModel: Boolean(config.llm.model && config.llm.model !== "xx")
    }
  };
}

function hashFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isGeneratedFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf8");
  return content.includes("generated-by: opencode-plusplus");
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)].sort();
}

function sortBy<T>(items: T[], getKey: (item: T) => string): T[] {
  return [...items].sort((a, b) => getKey(a).localeCompare(getKey(b)));
}
