import type { AgentExecutorInput, AgentExecutorResult } from "../orchestrator.js";

export interface ExecutePhaseInput {
  executor: (input: AgentExecutorInput) => Promise<AgentExecutorResult>;
  executorInput: AgentExecutorInput;
}

export interface ExecutePhaseOutput {
  executorResult: AgentExecutorResult;
}

export async function runExecutePhase(input: ExecutePhaseInput): Promise<ExecutePhaseOutput> {
  return { executorResult: await input.executor(input.executorInput) };
}
