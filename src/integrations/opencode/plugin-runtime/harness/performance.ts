import type { PluginPerformance, PluginPerformanceStatus } from "./types.js";

export const PLUGIN_STAGE_TARGETS = {
  prepare: 5000,
  retrieve: 3000,
  evaluate: 5000
} as const;

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
