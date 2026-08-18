export const OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES = [
  "opencode_plusplus_enable",
  "opencode_plusplus_disable",
  "opencode_plusplus_status",
  "opencode_plusplus_prepare",
  "opencode_plusplus_retrieve",
  "opencode_plusplus_evaluate",
  "opencode_plusplus_next"
] as const;

export type OpenCodePlusPlusPluginToolName = (typeof OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES)[number];

export type PluginHarnessTaskType = "bugfix" | "feature" | "refactor";

export interface PluginPrepareArgs {
  task: string;
  type?: PluginHarnessTaskType;
}

export interface PluginRetrieveArgs {
  task: string;
  topK?: number;
}

export interface PluginEvaluateArgs {
  taskId?: string;
}

export interface PluginNextArgs {
  taskId?: string;
}

export interface PluginHarnessSession {
  taskId: string;
  task: string;
  type: PluginHarnessTaskType | "auto";
  updatedAt: string;
}

export interface PluginPrepareResult {
  taskId: string;
  task: string;
  type: string;
  mustInspect: string[];
  allowedEditGlobs: string[];
  avoidEditGlobs: string[];
  requiredCommands: string[];
  nextStep: string;
}

export interface PluginRetrieveHit {
  path: string;
  score: number;
  reason: string;
}

export interface PluginRetrieveResult {
  task: string;
  hits: PluginRetrieveHit[];
}

export interface PluginEvaluateResult {
  taskId: string;
  blocking: boolean;
  decision: string;
  findings: string[];
  missingEvidence: string[];
  requiredCommands: string[];
}

export interface PluginNextResult {
  taskId: string;
  nextAction: string;
  blocking: boolean;
  missingEvidence: string[];
  requiredCommands: string[];
  completionRule: string;
}
