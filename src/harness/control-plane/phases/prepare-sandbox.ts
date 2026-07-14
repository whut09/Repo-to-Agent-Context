import type { SandboxAdapter, SandboxHandle } from "../../../sandbox/sandbox-adapter.js";

export interface PrepareSandboxPhaseInput {
  sandbox: SandboxAdapter;
  runId: string;
  repo: string;
}

export interface PrepareSandboxPhaseOutput {
  handle: SandboxHandle;
}

export async function runPrepareSandboxPhase(input: PrepareSandboxPhaseInput): Promise<PrepareSandboxPhaseOutput> {
  return { handle: await input.sandbox.prepare(input.runId, input.repo) };
}
