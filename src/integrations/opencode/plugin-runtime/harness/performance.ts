import type { PluginPerformance, PluginPerformanceStatus } from "./types.js";
import type { CacheStats } from "../../../../core/types.js";

export const PLUGIN_STAGE_TARGETS = {
  prepare: 15000,
  retrieve: 3000,
  evaluate: 5000
} as const;

export function contextModeForStats(stats: CacheStats): PluginPerformance["contextMode"] {
  if (!stats.enabled || stats.dependencyInvalidated || (stats.indexMisses > 0 && stats.indexHits === 0)) return "rebuilt";
  if (stats.indexMisses > 0 || stats.graphMisses > 0) return "incremental";
  return "reused";
}

export function cacheStatusForStats(stats: CacheStats): "hit" | "miss" {
  return stats.enabled && stats.fileHashMisses + stats.indexMisses + stats.graphMisses + stats.tokenMisses === 0 ? "hit" : "miss";
}

export interface PluginStageResult<T> {
  status: PluginPerformanceStatus;
  durationMs: number;
  value?: T;
}

export async function runPluginStage<T>(
  stage: keyof typeof PLUGIN_STAGE_TARGETS,
  operation: () => Promise<T>,
  overrideTargetMs?: number
): Promise<PluginStageResult<T>> {
  const startedAt = Date.now();
  const targetMs = overrideTargetMs ?? PLUGIN_STAGE_TARGETS[stage];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<PluginStageResult<T>>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve({ status: "timeout", durationMs: Date.now() - startedAt });
    }, targetMs);
  });
  const completed = operation().then(
    (value) => ({ status: "completed" as const, durationMs: Date.now() - startedAt, value }),
    (error: unknown) => {
      if (timedOut) return { status: "timeout" as const, durationMs: Date.now() - startedAt };
      throw error;
    }
  );
  const result = await Promise.race([completed, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

export function pluginPerformance(
  stage: keyof typeof PLUGIN_STAGE_TARGETS,
  result: Pick<PluginStageResult<unknown>, "status" | "durationMs">,
  cache: "hit" | "miss",
  contextMode: PluginPerformance["contextMode"],
  selectedFiles: string[],
  rejectedFiles: string[]
): PluginPerformance {
  return {
    stage,
    durationMs: result.durationMs,
    targetMs: PLUGIN_STAGE_TARGETS[stage],
    status: result.status,
    cache,
    contextMode,
    selectedFiles,
    rejectedFiles
  };
}
