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
  sessionId?: string | null;
}

export interface PluginRetrieveArgs {
  task: string;
  topK?: number;
  sessionId?: string | null;
}

export interface PluginEvaluateArgs {
  taskId?: string;
  sessionId?: string | null;
}

export interface PluginNextArgs {
  taskId?: string;
  sessionId?: string | null;
}

export interface PluginHarnessSession {
  taskId: string;
  task: string;
  type: PluginHarnessTaskType | "auto";
  sessionId?: string | null;
  updatedAt: string;
}

export type PluginHarnessToolKind = "prepare" | "retrieve" | "evaluate" | "next";
export type PluginTaskIdSource = "argument" | "session" | "created" | "none";

export interface PluginHarnessResult {
  schemaVersion: string;
  ok: boolean;
  tool: PluginHarnessToolKind;
  summary: string;
  error?: { code: string; message: string };
  taskId: string | null;
  sessionId: string | null;
  taskIdSource: PluginTaskIdSource;
  repository: string;
  workingTreeHash: string;
  currentPhase: string;
  decision: string;
  blocking: boolean;
  findings: string[];
  missingEvidence: string[];
  requiredCommands: string[];
  mustInspect: string[];
  allowedEditGlobs: string[];
  avoidEditGlobs: string[];
  artifacts: string[];
  nextAction: string;
  hits?: Array<{ path: string; score: number; reason: string }>;
}

export type PluginPrepareResult = PluginHarnessResult;
export type PluginRetrieveResult = PluginHarnessResult;
export type PluginEvaluateResult = PluginHarnessResult;
export type PluginNextResult = PluginHarnessResult;

export interface PluginEvaluateState {
  schemaVersion: string;
  taskId: string;
  sessionId: string | null;
  taskIdSource: PluginTaskIdSource;
  workingTreeHash: string;
  currentPhase: string;
  decision: string;
  blocking: boolean;
  findings: string[];
  missingEvidence: string[];
  requiredCommands: string[];
  mustInspect: string[];
  allowedEditGlobs: string[];
  avoidEditGlobs: string[];
  artifacts: string[];
  nextAction: string;
  summary: string;
  updatedAt: string;
}
