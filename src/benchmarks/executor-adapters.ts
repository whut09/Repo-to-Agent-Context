import type { AgentExecutorName } from "../harness/control-plane/orchestrator.js";

export interface RealExecutorAdapter {
  name: Exclude<AgentExecutorName, "mock">;
  displayName: string;
  normalizer: "opencode-json" | "generic-command";
  commandRequired: true;
}

const REAL_EXECUTOR_ADAPTERS: RealExecutorAdapter[] = [
  { name: "opencode", displayName: "OpenCode", normalizer: "opencode-json", commandRequired: true },
  { name: "codex", displayName: "Codex CLI", normalizer: "generic-command", commandRequired: true },
  { name: "claude-code", displayName: "Claude Code", normalizer: "generic-command", commandRequired: true },
  { name: "mimocode", displayName: "MiMoCode", normalizer: "generic-command", commandRequired: true },
  { name: "cursor", displayName: "Cursor", normalizer: "generic-command", commandRequired: true }
];

export function realExecutorAdapter(name: AgentExecutorName): RealExecutorAdapter {
  const adapter = REAL_EXECUTOR_ADAPTERS.find((item) => item.name === name);
  if (!adapter) throw new Error("Real agent benchmark requires opencode, codex, claude-code, mimocode, or cursor; mock is proxy-only.");
  return adapter;
}

export function realExecutorAdapterNames(): RealExecutorAdapter["name"][] {
  return REAL_EXECUTOR_ADAPTERS.map((adapter) => adapter.name);
}
