import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import type { AgentTarget, CacheStats, IndexedFile } from "../../core/types.js";
import { buildContextPackage } from "../../core/context-builder.js";
import { changedFilesSince } from "../../core/git.js";
import { validateContextPackage } from "../../core/validator.js";
import { assessDrift, assessFreshness, buildContextManifest, renderDriftReport, renderFreshnessReport } from "../../core/freshness.js";
import { summarizeReadiness } from "../../core/readiness.js";
import { parseTokenizerMode } from "../../core/token-estimator.js";
import { formatTokenSavings } from "../../core/token-savings.js";
import { starterConfig } from "../../config/starter-config.js";
import { buildContextDelta, renderContextDelta, writeContextDelta } from "../../outputs/context-delta.js";
import { renderDependencyGraph } from "../../outputs/dependency-graph.js";
import { writeContextPackage } from "../../outputs/renderers/writer.js";
import { parseInteger, parseTarget } from "../parsers/options.js";
import { buildAndWriteApplicationContext } from "../../application/context-service.js";

export function registerContextCommands(program: Command): void {
  program
    .command("build")
    .argument("[repo]", "repository path", ".")
    .option("-t, --target <target>", "agent target: opencode, codex, claude, cursor, all", parseTarget)
    .option("-b, --token-budget <tokens>", "target token budget", parseInteger)
    .option("--tokenizer <tokenizer>", "tokenizer: chars-approx, cl100k_base, o200k_base", parseTokenizerMode)
    .option("--model <model>", "model name used to infer tokenizer, for example gpt-4.1")
    .option("--llm", "enable LLM summaries using opencode-plusplus.local.yml")
    .option("--no-llm", "disable LLM summaries")
    .description("Generate AGENTS.md and .agent-context outputs.")
    .action(
      async (
        repo: string,
        options: { target?: AgentTarget; tokenBudget?: number; tokenizer?: ReturnType<typeof parseTokenizerMode>; model?: string; llm?: boolean }
      ) => {
        const result = await buildAndWriteApplicationContext(repo, options);
        const context = result.context;
        console.log(`Generated agent context for ${context.scan.root}`);
        console.log(`Files scanned: ${context.scan.files.length}`);
        console.log(`Languages: ${context.scan.languages.join(", ") || "none detected"}`);
        console.log(`Key files: ${context.keyFiles.length}`);
        console.log(`Agent readiness: ${context.readiness.grade} / ${context.readiness.score}`);
        console.log(`Summary mode: ${context.summaries.mode}`);
        if (context.summaries.fallbackReason && context.summaries.fallbackReason !== "disabled") {
          console.log(`LLM fallback reason: ${context.summaries.fallbackReason}`);
        }
        console.log(formatTokenSavings(context.tokenSavings));
        console.log("Written:");
        for (const file of result.writtenFiles) console.log(`- ${file}`);
      }
    );

  program
    .command("savings")
    .argument("[repo]", "repository path", ".")
    .option("-b, --token-budget <tokens>", "target token budget", parseInteger)
    .option("--actual", "write the context package first and report actual generated output tokens")
    .option("--tokenizer <tokenizer>", "tokenizer: chars-approx, cl100k_base, o200k_base", parseTokenizerMode)
    .option("--model <model>", "model name used to infer tokenizer, for example gpt-4.1")
    .description("Print the token savings report.")
    .action(async (repo: string, options: { tokenBudget?: number; actual?: boolean; tokenizer?: ReturnType<typeof parseTokenizerMode>; model?: string }) => {
      const context = await buildContextPackage(repo, options);
      if (options.actual) {
        writeContextPackage(context);
      }
      console.log(formatTokenSavings(context.tokenSavings));
    });

  program
    .command("init")
    .argument("[repo]", "repository path", ".")
    .description("Create a starter opencode-plusplus.config.yml.")
    .action((repo: string) => {
      const root = path.resolve(repo);
      const configPath = path.join(root, "opencode-plusplus.config.yml");

      if (existsSync(configPath)) {
        console.log(`Config already exists: ${configPath}`);
        return;
      }

      writeFileSync(configPath, starterConfig(), "utf8");
      console.log(`Created ${configPath}`);
    });

  program
    .command("graph")
    .argument("[repo]", "repository path", ".")
    .description("Print the generated dependency graph markdown.")
    .action(async (repo: string) => {
      const context = await buildContextPackage(repo);
      console.log(renderDependencyGraph(context));
    });

  program
    .command("readiness")
    .argument("[repo]", "repository path", ".")
    .description("Print the agent readiness score and missing context signals.")
    .action(async (repo: string) => {
      const context = await buildContextPackage(repo);
      console.log(summarizeReadiness(context));
    });

  program
    .command("validate")
    .argument("[repo]", "repository path", ".")
    .description("Validate config, generated JSON, dependency edges, confidence, and token budget.")
    .action(async (repo: string) => {
      const context = await buildContextPackage(repo);
      const report = validateContextPackage(context);
      console.log(report.valid ? "Validation: passed" : "Validation: failed");
      for (const issue of report.issues) {
        console.log(`- ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
      }
      if (!report.valid) process.exitCode = 1;
    });

  program
    .command("freshness")
    .argument("[repo]", "repository path", ".")
    .option("--json", "print machine-readable freshness report")
    .description("Check whether AGENTS.md and .agent-context were generated from the current source, config, and commit.")
    .action(async (repo: string, options: { json?: boolean }) => {
      const context = await buildContextPackage(repo);
      const report = assessFreshness(context);
      console.log(options.json ? JSON.stringify(report, null, 2) : renderFreshnessReport(report));
      if (report.status !== "fresh") process.exitCode = 1;
    });

  program
    .command("drift")
    .argument("[repo]", "repository path", ".")
    .option("--json", "print machine-readable drift report")
    .description("Detect stale generated context, dependency graph, task pack, and contract drift.")
    .action(async (repo: string, options: { json?: boolean }) => {
      const context = await buildContextPackage(repo);
      const report = assessDrift(context);
      console.log(options.json ? JSON.stringify(report, null, 2) : renderDriftReport(report));
      if (report.status !== "clean") process.exitCode = 1;
    });

  program
    .command("delta")
    .argument("[repo]", "repository path", ".")
    .option("--base <ref>", "base git ref for context delta analysis", "main")
    .option("--json", "print machine-readable context delta")
    .description("Show what changed, which context outputs are stale, and what an agent must re-read.")
    .action(async (repo: string, options: { base: string; json?: boolean }) => {
      const context = await buildContextPackage(repo);
      const report = buildContextDelta(context, { base: options.base });
      console.log(options.json ? JSON.stringify(report, null, 2) : renderContextDelta(report));
    });

  program
    .command("evolve")
    .argument("[repo]", "repository path", ".")
    .option("--base <ref>", "base git ref for context delta analysis", "main")
    .option("--json", "print machine-readable evolve report after updating context")
    .description("Refresh the agent context with cache-aware full output rebuild and write .agent-context/delta/latest.*.")
    .action(async (repo: string, options: { base: string; json?: boolean }) => {
      const context = await buildContextPackage(repo);
      const delta = buildContextDelta(context, { base: options.base });
      const result = writeContextPackage(context);
      const deltaResult = writeContextDelta(context, delta);
      const rewrittenOutputs = [...result.files, ...deltaResult.files].map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/"));
      const evolveReport = {
        mode: "cache-aware-full-refresh",
        selectiveWrite: false,
        note: "evolve currently reuses scan/index/graph/token caches, then refreshes the full generated context plus delta reports. Selective output writes are planned.",
        cache: summarizeCacheStats(context.cacheStats),
        delta,
        rewrittenOutputs
      };
      writeFileSync(
        path.join(context.scan.root, ".agent-context", "manifest.json"),
        `${JSON.stringify(buildContextManifest(context, [...result.files, ...deltaResult.files]), null, 2)}\n`,
        "utf8"
      );
      if (options.json) {
        console.log(JSON.stringify(evolveReport, null, 2));
        return;
      }
      console.log(renderContextDelta(delta));
      console.log("");
      console.log("Evolve mode: cache-aware full refresh (selective output writes: planned)");
      console.log(`Cache: ${formatCacheStats(context.cacheStats)}`);
      console.log(`Rewritten outputs: ${rewrittenOutputs.length}`);
      for (const file of rewrittenOutputs.slice(0, 12)) console.log(`- ${file}`);
      if (rewrittenOutputs.length > 12) console.log(`- ... ${rewrittenOutputs.length - 12} more`);
    });

  program
    .command("diff")
    .argument("[repo]", "repository path", ".")
    .option("--base <ref>", "base git ref", "main")
    .description("Generate context for files changed since a git base ref.")
    .action(async (repo: string, options: { base: string }) => {
      const context = await buildContextPackage(repo);
      const changed = new Set(changedFilesSince(context.scan.root, options.base));
      const files = context.index.files.filter((file) => changed.has(file.path));
      console.log("# Diff Context");
      console.log("");
      console.log(`Base: ${options.base}`);
      console.log("");
      printFileList(files);
    });

  program
    .command("update")
    .argument("[repo]", "repository path", ".")
    .option("--since <ref>", "show changed files since a git ref after rebuilding", "main")
    .description("Rebuild the context package and report files changed since a git ref.")
    .action(async (repo: string, options: { since: string }) => {
      const context = await buildContextPackage(repo);
      const result = writeContextPackage(context);
      const changed = changedFilesSince(context.scan.root, options.since);
      console.log(`Updated agent context for ${context.scan.root}`);
      console.log(`Written files: ${result.files.length}`);
      console.log(`Changed since ${options.since}:`);
      for (const file of changed) {
        console.log(`- ${file}`);
      }
    });

  program
    .command("explain")
    .argument("<path>", "file path or module name to explain")
    .argument("[repo]", "repository path", ".")
    .description("Explain a file or module from the generated repository index.")
    .action(async (targetPath: string, repo: string) => {
      const context = await buildContextPackage(repo);
      const normalized = targetPath.replace(/\\/g, "/");
      const file = context.index.files.find((candidate) => candidate.path === normalized);
      if (file) {
        console.log(`# ${file.path}`);
        console.log("");
        console.log(file.summary);
        console.log(`Kind: ${file.kind}`);
        console.log(`Module: ${file.moduleName}`);
        console.log(`Analyzer: ${file.analyzer} (${file.confidence} confidence)`);
        console.log(
          `Analysis stats: ${file.analysisStats.parser}, imports ${file.analysisStats.importsResolved}/${file.imports.length} resolved, ${file.analysisStats.routesDetected} routes`
        );
        console.log(`Importance: ${file.importanceScore} (${file.importanceReasons.join(", ") || "no ranking signals"})`);
        console.log(`Imports: ${file.imports.map((item) => item.specifier).join(", ") || "none"}`);
        console.log(`Exports: ${file.exports.join(", ") || "none"}`);
        return;
      }

      const module = context.index.modules.find((candidate) => candidate.name === normalized);
      if (module) {
        console.log(`# ${module.name}`);
        console.log("");
        console.log(module.summary);
        console.log(`Files: ${module.files.length}`);
        console.log(`Depends on: ${module.imports.join(", ") || "none"}`);
        for (const moduleFile of module.files.slice(0, 30)) {
          console.log(`- ${moduleFile}`);
        }
        return;
      }

      console.error(`No file or module found for: ${targetPath}`);
      process.exitCode = 1;
    });
}

function summarizeCacheStats(stats: CacheStats) {
  return {
    enabled: stats.enabled,
    reusedIndexedFiles: stats.indexHits,
    reindexedFiles: stats.indexMisses,
    reusedFileHashes: stats.fileHashHits,
    recalculatedFileHashes: stats.fileHashMisses,
    graphReused: stats.graphHits > 0,
    graphRebuilt: stats.graphMisses > 0,
    tokenCacheHits: stats.tokenHits,
    tokenCacheMisses: stats.tokenMisses,
    prunedFileHashes: stats.prunedFileHashes,
    prunedIndexEntries: stats.prunedIndexEntries
  };
}

function formatCacheStats(stats: CacheStats): string {
  if (!stats.enabled) return "disabled";
  const summary = summarizeCacheStats(stats);
  return [
    `reused indexed files ${summary.reusedIndexedFiles}`,
    `re-indexed files ${summary.reindexedFiles}`,
    `graph rebuilt ${summary.graphRebuilt ? "yes" : "no"}`,
    `token hits ${summary.tokenCacheHits}`,
    `token misses ${summary.tokenCacheMisses}`
  ].join("; ");
}

function printFileList(files: IndexedFile[]): void {
  if (!files.length) {
    console.log("No matching files detected.");
    return;
  }

  for (const file of files.sort((a, b) => b.importanceScore - a.importanceScore || a.path.localeCompare(b.path))) {
    console.log(`- ${file.path}`);
    console.log(`  - Score: ${file.importanceScore}`);
    console.log(`  - Summary: ${file.summary}`);
  }
}
