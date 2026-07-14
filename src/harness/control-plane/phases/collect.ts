import { normalizeAgentEvents, type AgentEvent } from "../../../outputs/agent-events.js";
import type { AgentExecutorResult } from "../orchestrator.js";

export interface CollectPhaseInput {
  executorResult: AgentExecutorResult;
  repo: string;
  transcriptPath?: string;
}

export interface CollectPhaseOutput {
  events: AgentEvent[];
  source: string;
  warnings: string[];
}

export function runCollectPhase(input: CollectPhaseInput): CollectPhaseOutput {
  return normalizeAgentEvents({
    executor: input.executorResult.executor,
    stdout: input.executorResult.stdout,
    stderr: input.executorResult.stderr,
    repo: input.repo,
    transcriptPath: input.transcriptPath,
    startedAt: input.executorResult.startedAt,
    finishedAt: input.executorResult.finishedAt,
    exitCode: input.executorResult.exitCode
  });
}
