import path from "node:path";
import { currentSidecarWorkingTreeHash } from "../worktree-hash.js";
import { emptyPluginInterventions, type PluginHarnessResult, type PluginHarnessToolKind, type PluginPerformance, type PluginTaskIdSource } from "./types.js";
import { buildPluginHarnessVisualization, persistPluginHarnessVisualization, renderPluginHarnessVisualization } from "./visualization.js";

export const PLUGIN_HARNESS_SCHEMA_VERSION = "opencode-plusplus.desktop-harness.v1";

export function createPluginHarnessResult(
  root: string,
  input: Omit<
    PluginHarnessResult,
    | "schemaVersion"
    | "repository"
    | "workingTreeHash"
    | "findings"
    | "missingEvidence"
    | "requiredCommands"
    | "mustInspect"
    | "allowedEditGlobs"
    | "avoidEditGlobs"
    | "artifacts"
    | "interventions"
    | "visualization"
  > &
    Partial<
      Pick<
        PluginHarnessResult,
        | "findings"
        | "missingEvidence"
        | "requiredCommands"
        | "mustInspect"
        | "allowedEditGlobs"
        | "avoidEditGlobs"
        | "artifacts"
        | "interventions"
        | "visualization"
      >
    >
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
    artifacts: normalize(input.artifacts),
    interventions:
      input.interventions ??
      emptyPluginInterventions(
        path.relative(root, path.join(root, ".agent-context", "interventions", `${input.taskId ?? "unknown"}.jsonl`)).replaceAll("\\", "/")
      ),
    visualization:
      input.visualization ??
      buildPluginHarnessVisualization({
        currentPhase: input.currentPhase,
        taskStarted: Boolean(input.taskId),
        decision: input.decision,
        blocking: input.blocking,
        nextAction: input.nextAction,
        workingTreeHash: currentSidecarWorkingTreeHash(root),
        findings: input.findings,
        missingEvidence: input.missingEvidence,
        requiredCommands: input.requiredCommands,
        mustInspect: input.mustInspect,
        interventions: input.interventions
      })
  };
}

export function createPluginHarnessError(
  root: string,
  tool: PluginHarnessToolKind,
  message: string,
  taskId: string | null = null,
  sessionId: string | null = null,
  taskIdSource: PluginTaskIdSource = "none",
  performance?: PluginPerformance
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
    nextAction: "prepare",
    performance
  });
}

export function renderPluginHarnessResult(result: PluginHarnessResult): string {
  const visualization =
    result.visualization ??
    buildPluginHarnessVisualization({
      taskStarted: Boolean(result.taskId),
      currentPhase: result.currentPhase,
      decision: result.decision,
      blocking: result.blocking,
      nextAction: result.nextAction,
      workingTreeHash: result.workingTreeHash,
      findings: result.findings,
      missingEvidence: result.missingEvidence,
      requiredCommands: result.requiredCommands,
      mustInspect: result.mustInspect,
      interventions: result.interventions
    });
  const normalized = { ...result, visualization };
  persistPluginHarnessVisualization(normalized.repository, visualization);
  return `${JSON.stringify({ ...normalized, humanReadable: humanReadableSummary(normalized) }, null, 2)}\n`;
}

function humanReadableSummary(result: PluginHarnessResult): string {
  const lines = [
    `OpenCode++ ${result.tool}: ${result.summary}`,
    `Decision: ${result.decision}${result.blocking ? " (blocking)" : ""}`,
    `Next: ${result.nextAction}`
  ];
  if (result.mustInspect.length) lines.push(`Selected files: ${result.mustInspect.join(", ")}`);
  if (result.interventions?.excludedFiles.length) {
    lines.push(`Excluded files: ${result.interventions.excludedFiles.map((file) => `${file.path} (${file.reason})`).join(", ")}`);
  }
  if (result.interventions?.verifiedFixes.length) lines.push(`Verified fixes: ${result.interventions.verifiedFixes.map((event) => event.problem).join("; ")}`);
  if (result.interventions?.contextHelp?.length) lines.push(`Context help: ${result.interventions.contextHelp.join("; ")}`);
  if (result.interventions?.adoptedContextAdvice?.length)
    lines.push(`Context advice adopted: ${result.interventions.adoptedContextAdvice.map((item) => item.summary).join("; ")}`);
  if (result.interventions?.rejectedContextAdvice?.length)
    lines.push(`Context advice rejected: ${result.interventions.rejectedContextAdvice.map((item) => `${item.summary} (${item.reason})`).join("; ")}`);
  if (result.interventions?.feedback?.total) {
    lines.push(
      `Context feedback: ${result.interventions.feedback.total} local rating(s); network ${result.interventions.feedback.networkEnabled ? "enabled" : "disabled"}.`
    );
  }
  if (result.interventions?.remainingProblems.length)
    lines.push(`Remaining problems: ${result.interventions.remainingProblems.map((event) => event.problem).join("; ")}`);
  if (result.interventions?.humanReview.length) lines.push(`Human review: ${result.interventions.humanReview.map((event) => event.problem).join("; ")}`);
  if (result.requiredCommands.length) lines.push(`Required commands: ${result.requiredCommands.join(" | ")}`);
  if (result.visualization) lines.push(renderPluginHarnessVisualization(result.visualization));
  return lines.join("\n");
}

function normalize(items: string[] | undefined): string[] {
  return [...new Set((items ?? []).map((item) => item.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
