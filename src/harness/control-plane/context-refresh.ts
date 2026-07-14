import type { ContextPackage } from "../../core/types.js";
import { buildContextPackage } from "../../core/context-builder.js";
import { assessDrift } from "../../core/freshness.js";
import type { HarnessDecisionAction } from "../types.js";

export type ContextRefreshMode = "reused" | "incremental" | "rebuilt";

export interface ContextRefreshMetrics {
  mode: ContextRefreshMode;
  reason: string;
  cacheHit: boolean;
  cacheMiss: boolean;
  cacheHits: number;
  cacheMisses: number;
  buildCount: number;
  durationMs: number;
}

export interface ContextRefreshInput {
  root: string;
  context: ContextPackage;
  previousDecisionAction?: HarnessDecisionAction;
  contextWorkingTreeHash: string;
  currentWorkingTreeHash: string;
  modifiedFiles?: string[];
}

export interface ContextRefreshResult {
  context: ContextPackage;
  metrics: ContextRefreshMetrics;
}

export type ContextBuilder = (root: string, options?: { cache?: boolean }) => Promise<ContextPackage>;

export function selectContextRefresh(input: ContextRefreshInput): Pick<ContextRefreshMetrics, "mode" | "reason"> {
  if (input.previousDecisionAction === "repack") return { mode: "rebuilt", reason: "Previous decision requested repack/context refresh." };
  if (assessDrift(input.context).status !== "clean") return { mode: "rebuilt", reason: "Generated context drift requires a full rebuild." };
  if (input.contextWorkingTreeHash === input.currentWorkingTreeHash || input.modifiedFiles?.length === 0) {
    return { mode: "reused", reason: "Executor did not modify actionable repository files." };
  }
  if (input.modifiedFiles?.some(isDependencyInvalidatingFile)) {
    return { mode: "rebuilt", reason: "Dependency or project configuration changed." };
  }
  return {
    mode: "incremental",
    reason:
      input.previousDecisionAction === "repair"
        ? "Repair changed source files; refresh through the incremental cache."
        : "Source files changed; refresh through the incremental cache."
  };
}

export async function refreshHarnessContext(input: ContextRefreshInput, builder: ContextBuilder = buildContextPackage): Promise<ContextRefreshResult> {
  const selected = selectContextRefresh(input);
  if (selected.mode === "reused") {
    return {
      context: input.context,
      metrics: {
        ...selected,
        cacheHit: true,
        cacheMiss: false,
        cacheHits: 1,
        cacheMisses: 0,
        buildCount: 0,
        durationMs: 0
      }
    };
  }

  const startedAt = performance.now();
  const context = await builder(input.root, { cache: selected.mode === "incremental" });
  const durationMs = performance.now() - startedAt;
  const cacheHits = context.cacheStats.fileHashHits + context.cacheStats.indexHits + context.cacheStats.graphHits + context.cacheStats.tokenHits;
  const cacheMisses = context.cacheStats.fileHashMisses + context.cacheStats.indexMisses + context.cacheStats.graphMisses + context.cacheStats.tokenMisses;
  return {
    context,
    metrics: {
      ...selected,
      cacheHit: cacheHits > 0,
      cacheMiss: cacheMisses > 0 || selected.mode === "rebuilt",
      cacheHits,
      cacheMisses,
      buildCount: 1,
      durationMs
    }
  };
}

export function initialContextMetrics(context: ContextPackage, durationMs: number): ContextRefreshMetrics {
  const cacheHits = context.cacheStats.fileHashHits + context.cacheStats.indexHits + context.cacheStats.graphHits + context.cacheStats.tokenHits;
  const cacheMisses = context.cacheStats.fileHashMisses + context.cacheStats.indexMisses + context.cacheStats.graphMisses + context.cacheStats.tokenMisses;
  return {
    mode: "rebuilt",
    reason: "Initial repository context build.",
    cacheHit: cacheHits > 0,
    cacheMiss: cacheMisses > 0,
    cacheHits,
    cacheMisses,
    buildCount: 1,
    durationMs
  };
}

export function combineContextRefreshMetrics(first: ContextRefreshMetrics, second: ContextRefreshMetrics): ContextRefreshMetrics {
  const priority: Record<ContextRefreshMode, number> = { reused: 0, incremental: 1, rebuilt: 2 };
  return {
    mode: priority[second.mode] > priority[first.mode] ? second.mode : first.mode,
    reason: first.reason === second.reason ? first.reason : `${first.reason} ${second.reason}`,
    cacheHit: first.cacheHit || second.cacheHit,
    cacheMiss: first.cacheMiss || second.cacheMiss,
    cacheHits: first.cacheHits + second.cacheHits,
    cacheMisses: first.cacheMisses + second.cacheMisses,
    buildCount: first.buildCount + second.buildCount,
    durationMs: first.durationMs + second.durationMs
  };
}

function isDependencyInvalidatingFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  const name = normalized.split("/").at(-1) ?? normalized;
  return (
    name === "package.json" ||
    name === "package-lock.json" ||
    name === "pnpm-lock.yaml" ||
    name === "yarn.lock" ||
    name === "bun.lock" ||
    name === "bun.lockb" ||
    name === "pyproject.toml" ||
    name === "requirements.txt" ||
    name === "cargo.toml" ||
    name === "cargo.lock" ||
    name === "go.mod" ||
    name === "go.sum" ||
    /^tsconfig(?:\..+)?\.json$/.test(name) ||
    /^jsconfig(?:\..+)?\.json$/.test(name) ||
    name.startsWith("opencode-plusplus.config.")
  );
}
