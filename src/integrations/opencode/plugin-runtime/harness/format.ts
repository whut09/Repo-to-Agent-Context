import type { PluginEvaluateResult, PluginNextResult, PluginPrepareResult, PluginRetrieveResult } from "./types.js";

export function renderPrepareText(result: PluginPrepareResult): string {
  return [
    "OpenCode++ prepare",
    "",
    `taskId: ${result.taskId}`,
    `task: ${result.task}`,
    `type: ${result.type}`,
    "",
    "mustInspect:",
    ...bullet(result.mustInspect),
    "",
    "allowedEditGlobs:",
    ...bullet(result.allowedEditGlobs),
    "",
    "avoidEditGlobs:",
    ...bullet(result.avoidEditGlobs),
    "",
    "requiredCommands:",
    ...bullet(result.requiredCommands),
    "",
    `next: ${result.nextStep}`
  ].join("\n");
}

export function renderRetrieveText(result: PluginRetrieveResult): string {
  return [
    "OpenCode++ retrieve",
    "",
    `task: ${result.task}`,
    "",
    "hits:",
    ...(result.hits.length ? result.hits.map((hit) => `- ${hit.path} (score ${hit.score}) — ${hit.reason}`) : ["- none"])
  ].join("\n");
}

export function renderEvaluateText(result: PluginEvaluateResult): string {
  return [
    "OpenCode++ evaluate",
    "",
    `taskId: ${result.taskId}`,
    `blocking: ${result.blocking ? "yes" : "no"}`,
    `decision: ${result.decision}`,
    "",
    "findings:",
    ...bullet(result.findings),
    "",
    "missingEvidence:",
    ...bullet(result.missingEvidence),
    "",
    "requiredCommands:",
    ...bullet(result.requiredCommands)
  ].join("\n");
}

export function renderNextText(result: PluginNextResult): string {
  return [
    "OpenCode++ next",
    "",
    `taskId: ${result.taskId}`,
    `nextAction: ${result.nextAction}`,
    `blocking: ${result.blocking ? "yes" : "no"}`,
    "",
    "missingEvidence:",
    ...bullet(result.missingEvidence),
    "",
    "requiredCommands:",
    ...bullet(result.requiredCommands),
    "",
    result.completionRule
  ].join("\n");
}

export function renderHarnessError(tool: string, message: string): string {
  return [`OpenCode++ ${tool} failed`, "", message, "", "Do not claim the task is complete."].join("\n");
}

function bullet(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- none"];
}
