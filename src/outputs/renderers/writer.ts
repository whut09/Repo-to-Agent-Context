import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "../../core/atomic-store.js";
import type { ContextPackage } from "../../core/types.js";
import { buildContextManifest } from "../../core/freshness.js";
import { countTokens } from "../../core/token-estimator.js";
import { renderAgentsMd } from "../agents-md.js";
import { renderArchitecture } from "../architecture.js";
import { buildRepoContracts } from "../contracts.js";
import { renderContextLayers } from "../context-layers.js";
import { renderDependencyGraph, renderMermaidGraph } from "../dependency-graph.js";
import { renderKeyFiles } from "../key-files.js";
import { renderModuleMap } from "../module-map.js";
import { renderOnboarding } from "../onboarding.js";
import { renderReadiness } from "../readiness.js";
import { renderRepoSummary } from "../repo-summary.js";
import { buildRagDocuments, buildRagManifest, renderRagReadme } from "../rag.js";
import { ensureRegressionMemory } from "../../harness/verification-plane/guards/regression.js";
import { buildTaskPack, renderTaskContext } from "../task-context.js";
import { renderTokenSavings } from "../token-savings.js";

const GENERATED_AGENTS_FILE = "AGENTS.generated.md";
const COMPOSED_AGENTS_FILE = "AGENTS.md";
const MIGRATION_HEADINGS = [
  "环境依赖版本",
  "安装步骤",
  ".env/配置文件要求",
  "Docker / Compose / PM2 / systemd 部署方式",
  "启动命令",
  "数据目录与日志目录",
  "常见故障与恢复步骤"
];

export interface WriteResult {
  files: string[];
}

export function writeContextPackage(context: ContextPackage): WriteResult {
  const root = context.scan.root;
  const contextDir = path.join(root, ".agent-context");
  const indexDir = path.join(contextDir, "index");
  const evidenceDir = path.join(contextDir, "evidence");
  const graphDir = path.join(contextDir, "graphs");
  const contractsDir = path.join(contextDir, "contracts");
  const tasksDir = path.join(contextDir, "tasks");
  const ragDir = path.join(contextDir, "rag");
  const written: string[] = [];

  cleanupDisabledOutputs(context, contextDir, root);
  mkdirSync(indexDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(contractsDir, { recursive: true });
  if (context.config.outputs.graph) mkdirSync(graphDir, { recursive: true });
  if (context.config.outputs.tasks) mkdirSync(tasksDir, { recursive: true });
  if (context.config.outputs.rag) mkdirSync(ragDir, { recursive: true });

  if (context.config.outputs.agents) {
    ensureManualAgentsLayer(root, context.config.agents.manualSources, written);
    write(contextDir, GENERATED_AGENTS_FILE, renderAgentsMd(context), written);
    write(root, COMPOSED_AGENTS_FILE, composeAgentsMd(root, context.config.agents.manualSources), written);
  }
  write(contextDir, "repo-summary.md", renderRepoSummary(context), written);
  write(contextDir, "context-layers.md", renderContextLayers(context), written);
  write(contextDir, "key-files.md", renderKeyFiles(context), written);
  if (context.config.outputs.modules) {
    write(contextDir, "module-map.md", renderModuleMap(context), written);
    write(contextDir, "architecture.md", renderArchitecture(context), written);
  }
  if (context.config.outputs.graph) {
    write(contextDir, "dependency-graph.md", renderDependencyGraph(context), written);
    write(graphDir, "dependencies.mmd", renderMermaidGraph(context), written);
    writeJson(graphDir, "dependencies.json", context.graph, written);
  }
  write(contextDir, "onboarding.md", renderOnboarding(context), written);
  if (context.config.outputs.readiness) {
    write(contextDir, "readiness.md", renderReadiness(context), written);
    writeJson(contextDir, "readiness.json", context.readiness, written);
  }
  if (context.config.outputs.tasks) {
    write(tasksDir, "bugfix-context.md", renderTaskContext(context, "fix a bug or regression"), written);
    write(tasksDir, "feature-context.md", renderTaskContext(context, "add a feature or new behavior"), written);
    write(tasksDir, "refactor-context.md", renderTaskContext(context, "refactor code safely"), written);
    writeJson(tasksDir, "bugfix.json", buildTaskPack(context, "fix a bug or regression", { type: "bugfix" }), written);
    writeJson(tasksDir, "feature.json", buildTaskPack(context, "add a feature or new behavior", { type: "feature" }), written);
    writeJson(tasksDir, "refactor.json", buildTaskPack(context, "refactor code safely", { type: "refactor" }), written);
  }
  writeJson(indexDir, "files.json", context.index.files.map(sanitizeIndexedFile), written);
  writeJson(indexDir, "symbols.json", context.index.symbols, written);
  writeJson(indexDir, "modules.json", context.index.modules, written);
  writeJson(indexDir, "chunks.json", buildChunks(context), written);
  writeJson(
    evidenceDir,
    "file-evidence.json",
    context.index.files.map((file) => ({
      path: file.path,
      analyzer: file.analyzer,
      confidence: file.confidence,
      stats: file.analysisStats,
      evidence: file.evidence
    })),
    written
  );
  const contracts = buildRepoContracts(context);
  writeJson(contractsDir, "architecture.contract.json", contracts.architecture, written);
  writeJson(contractsDir, "module-boundaries.json", contracts.moduleBoundaries, written);
  writeJson(contractsDir, "commands.contract.json", contracts.commands, written);
  writeJson(contractsDir, "test.contract.json", contracts.test, written);
  writeJson(contractsDir, "safety.contract.json", contracts.safety, written);
  written.push(...ensureRegressionMemory(context));
  if (context.config.outputs.rag) {
    writeRagExport(ragDir, context, written);
  }
  context.tokenSavings.actualOutputTokens = measureActualOutputs(root, written, context.config.tokenizer);
  context.tokenSavings.contextPackTokens = context.tokenSavings.actualOutputTokens;
  context.tokenSavings.compressionRatio = context.tokenSavings.actualOutputTokens.total
    ? Math.max(1, Math.round(context.tokenSavings.originalRepoTokens.tokens / context.tokenSavings.actualOutputTokens.total))
    : 1;
  context.tokenSavings.withinBudget = context.tokenSavings.actualOutputTokens.total <= context.tokenSavings.tokenBudget;
  if (context.config.outputs.rag) {
    const documents = buildRagDocuments(context);
    rewriteJson(path.join(ragDir, "manifest.json"), buildRagManifest(context, documents.length));
  }
  write(contextDir, "token-savings.md", renderTokenSavings(context), written);
  writeJson(contextDir, "token-savings.json", context.tokenSavings, written);
  writeJson(contextDir, "manifest.json", buildContextManifest(context, dedupe(written)), written);

  return { files: dedupe(written) };
}

function rewriteJson(filePath: string, value: unknown): void {
  writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function measureActualOutputs(
  root: string,
  written: string[],
  tokenizer: ContextPackage["config"]["tokenizer"]
): NonNullable<ContextPackage["tokenSavings"]["actualOutputTokens"]> {
  const files = Object.fromEntries(
    dedupe(written)
      .filter((filePath) => /\.(md|mmd|jsonl)$/i.test(filePath))
      .filter((filePath) => !filePath.endsWith("token-savings.md"))
      .map((filePath) => {
        const tokenCount = countTokens(readFileSync(filePath, "utf8"), tokenizer);
        return [path.relative(root, filePath).replaceAll("\\", "/"), tokenCount.tokens];
      })
  );
  const total = Object.values(files).reduce((sum, tokens) => sum + tokens, 0);
  return {
    mode: "actual",
    tokenizer: tokenizer.mode,
    model: tokenizer.model,
    totalTokens: total,
    total,
    scope: "Generated Markdown, Mermaid, and RAG JSONL files; excludes machine-readable indexes and the token report itself.",
    files
  };
}

function cleanupDisabledOutputs(context: ContextPackage, contextDir: string, root: string): void {
  if (!context.config.outputs.agents) {
    removeGeneratedAgentFile(path.join(root, COMPOSED_AGENTS_FILE));
    removeGeneratedAgentFile(path.join(contextDir, GENERATED_AGENTS_FILE));
  }
  if (!context.config.outputs.modules) {
    removeGeneratedPath(contextDir, "module-map.md");
    removeGeneratedPath(contextDir, "architecture.md");
  }
  if (!context.config.outputs.graph) {
    removeGeneratedPath(contextDir, "dependency-graph.md");
    removeGeneratedPath(contextDir, "graphs");
  }
  if (!context.config.outputs.tasks) {
    removeGeneratedPath(contextDir, "tasks");
  }
  if (!context.config.outputs.readiness) {
    removeGeneratedPath(contextDir, "readiness.md");
    removeGeneratedPath(contextDir, "readiness.json");
  }
  if (!context.config.outputs.rag) {
    removeGeneratedPath(contextDir, "rag");
  }
}

function ensureManualAgentsLayer(root: string, manualSources: string[], written: string[]): void {
  if (manualSources.length === 0) {
    return;
  }

  const primaryManualPath = path.join(root, manualSources[0]);
  if (existsSync(primaryManualPath)) {
    return;
  }

  const agentsPath = path.join(root, COMPOSED_AGENTS_FILE);
  if (!existsSync(agentsPath)) {
    return;
  }

  const existing = readFileSync(agentsPath, "utf8");
  if (isGeneratedAgentFile(existing)) {
    return;
  }

  const migrated = extractManualContent(existing);
  writeTextFile(primaryManualPath, `${migrated.trim()}\n`);
  written.push(primaryManualPath);
}

function composeAgentsMd(root: string, manualSources: string[]): string {
  const manualBlocks = manualSources
    .map((source) => ({
      source,
      filePath: path.join(root, source)
    }))
    .filter((item) => existsSync(item.filePath))
    .map((item) => ({
      source: item.source,
      content: readFileSync(item.filePath, "utf8").trim()
    }))
    .filter((item) => item.content.length > 0);

  const generatedPath = path.join(root, ".agent-context", GENERATED_AGENTS_FILE);
  const generated = existsSync(generatedPath) ? readFileSync(generatedPath, "utf8").trim() : "";
  const composed: string[] = [
    "<!-- generated-by: opencode-plusplus -->",
    "<!-- do-not-edit: edit AGENTS.manual.md or configured manual sources instead -->",
    `<!-- manual-sources: ${manualSources.join(", ") || "(none)"} -->`,
    `<!-- generated-source: .agent-context/${GENERATED_AGENTS_FILE} -->`,
    "",
    "# Agent Guide"
  ];

  if (generated) {
    composed.push("", generated);
  }

  composed.push("", "## Manual Operations Context", "");
  if (manualBlocks.length > 0) {
    composed.push(
      "Manual environment, installation, configuration, deployment, data directory, log directory, and recovery notes are kept out of L0 by default.",
      "Load these files only for environment, deployment, configuration, or operations tasks:",
      "",
      ...manualBlocks.map((block) => `- ${block.source}`)
    );
  } else {
    composed.push("_No manual agent notes configured yet. Add environment and deployment guidance to `AGENTS.manual.md`._");
  }

  return composed.join("\n").trim();
}

function extractManualContent(existingAgents: string): string {
  const normalized = existingAgents.replace(/\r\n/g, "\n").trim();
  const extracted = MIGRATION_HEADINGS.map((heading) => extractSection(normalized, heading)).filter((section): section is string => Boolean(section));

  if (extracted.length > 0) {
    return ["<!-- migrated-from: AGENTS.md -->", "", ...extracted.flatMap((section) => [section, ""])].join("\n").trim();
  }

  return ["<!-- migrated-from: AGENTS.md -->", "", normalized].join("\n").trim();
}

function extractSection(content: string, heading: string): string | null {
  const escaped = escapeRegExp(heading);
  const pattern = new RegExp(`(^|\\n)(#{1,6}\\s*${escaped}\\s*\\n[\\s\\S]*?)(?=\\n#{1,6}\\s+|$)`, "i");
  const match = content.match(pattern);
  if (!match) {
    return null;
  }

  return match[2].trim();
}

function isGeneratedAgentFile(content: string): boolean {
  return (
    content.includes("generated-by: opencode-plusplus") ||
    content.includes("This file was generated by OpenCode++") ||
    content.includes("This file was generated by " + ["Code Agent", "++"].join(""))
  );
}

function removeGeneratedAgentFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  if (isGeneratedAgentFile(content)) {
    rmSync(filePath, { force: true });
  }
}

function removeGeneratedPath(contextDir: string, relativePath: string): void {
  const resolvedContextDir = path.resolve(contextDir);
  const target = path.resolve(contextDir, relativePath);
  if (target !== resolvedContextDir && !target.startsWith(`${resolvedContextDir}${path.sep}`)) {
    throw new Error(`Refusing to remove path outside generated context directory: ${target}`);
  }

  rmSync(target, { recursive: true, force: true });
}

function write(baseDir: string, fileName: string, content: string, written: string[]): void {
  const filePath = path.join(baseDir, fileName);
  writeTextFile(filePath, `${content.trim()}\n`);
  written.push(filePath);
}

function writeJson(baseDir: string, fileName: string, value: unknown, written: string[]): void {
  write(baseDir, fileName, JSON.stringify(value, null, 2), written);
}

function writeJsonl(baseDir: string, fileName: string, values: unknown[], written: string[]): void {
  write(baseDir, fileName, values.map((value) => JSON.stringify(value)).join("\n"), written);
}

function writeRagExport(baseDir: string, context: ContextPackage, written: string[]): void {
  const documents = buildRagDocuments(context);
  write(baseDir, "README.md", renderRagReadme(context), written);
  writeJson(baseDir, "manifest.json", buildRagManifest(context, documents.length), written);
  writeJsonl(baseDir, "documents.jsonl", documents, written);
}

function buildChunks(context: ContextPackage): Array<{
  path: string;
  moduleName: string;
  tokenEstimate: number;
  summary: string;
}> {
  return context.index.files.map((file) => ({
    path: file.path,
    moduleName: file.moduleName,
    tokenEstimate: file.tokenEstimate,
    summary: file.summary
  }));
}

function sanitizeIndexedFile(file: ContextPackage["index"]["files"][number]): Omit<typeof file, "absolutePath"> {
  const { absolutePath, ...safeFile } = file;
  void absolutePath;
  return safeFile;
}

function writeTextFile(filePath: string, content: string): void {
  writeTextAtomic(filePath, content);
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
