import path from "node:path";
import { currentSidecarWorkingTreeHash } from "../worktree-hash.js";
import type { PluginHarnessResult, PluginHarnessToolKind, PluginTaskIdSource } from "./types.js";

export const PLUGIN_HARNESS_SCHEMA_VERSION = "opencode-plusplus.desktop-harness.v1";

export function createPluginHarnessResult(
  root: string,
  input: Omit<PluginHarnessResult, "schemaVersion" | "repository" | "workingTreeHash" | "findings" | "missingEvidence" | "requiredCommands" | "mustInspect" | "allowedEditGlobs" | "avoidEditGlobs" | "artifacts">
    & Partial<Pick<PluginHarnessResult, "findings" | "missingEvidence" | "requiredCommands" | "mustInspect" | "allowedEditGlobs" | "avoidEditGlobs" | "artifacts">>
): PluginHarnessResult {
  return {
    ...input,
    schemaVersion: PLUGIN_HARNESS_SCHEMA_VERSION,
    repository: path.resolve(root),
    workingTreeHash: currentSidecarWorkingTreeHash(root),
    findings: normalize(input.findings),
    missingEvidence: normalize(input.missingEvidence),
    requiredCommands: normalize(input.requiredCommands),
    mustInspect: normalize(input.mustInspect),
    allowedEditGlobs: normalize(input.allowedEditGlobs),
    avoidEditGlobs: normalize(input.avoidEditGlobs),
    artifacts: normalize(input.artifacts)
  };
}

export function createPluginHarnessError(
  root: string,
  tool: PluginHarnessToolKind,
  message: string,
  taskId: string | null = null,
  sessionId: string | null = null,
  taskIdSource: PluginTaskIdSource = "none"
): PluginHarnessResult {
  return createPluginHarnessResult(root, {
    ok: false,
    tool,
    summary: `OpenCode++ ${tool} failed: ${message}`,
    error: { code: "HARNESS_ERROR", message },
    taskId,
    sessionId,
    taskIdSource,
    currentPhase: tool,
    decision: "error",
    blocking: true,
    nextAction: "prepare"
  });
}

export function renderPluginHarnessResult(result: PluginHarnessResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function normalize(items: string[] | undefined): string[] {
  return [...new Set((items ?? []).map((item) => item.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
