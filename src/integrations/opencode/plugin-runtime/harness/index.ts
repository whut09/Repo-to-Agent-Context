import {
  parseContextGetArgs,
  parseContextSearchArgs,
  parseContextStatusArgs,
  parseEvaluateArgs,
  parseFeedbackArgs,
  parseInterventionsArgs,
  parseNextArgs,
  parsePrepareArgs,
  parseRetrieveArgs
} from "./args.js";
import { harnessFailureMessage } from "./error.js";
import { evaluatePluginHarness } from "./evaluate.js";
import { renderEvaluateText, renderHarnessError, renderNextText, renderPrepareText, renderRetrieveText } from "./format.js";
import { nextPluginHarnessAction } from "./next.js";
import { preparePluginHarnessTask } from "./prepare.js";
import { retrievePluginHarnessContext } from "./retrieve.js";
import {
  runContextFeedbackTool,
  runContextGetTool,
  runContextSearchTool,
  runContextStatusTool,
  runInterventionsTool
} from "../../../../application/context-tools-service.js";
import { contextToolFailure } from "../../../../application/context-tools-protocol.js";
import { invalidArguments } from "../../../../application/context-tool-errors.js";
import { resolvePluginTaskId } from "./session.js";
import { notifyPluginInterventionSignals, type OpenCodeSidecarRecorder, type OpenCodeSidecarRuntimeContext } from "../events.js";

export { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "./types.js";
export type { OpenCodePlusPlusPluginToolName } from "./types.js";
export {
  parseContextGetArgs,
  parseContextSearchArgs,
  parseContextStatusArgs,
  parseEvaluateArgs,
  parseInterventionsArgs,
  parseNextArgs,
  parsePrepareArgs,
  parseRetrieveArgs
} from "./args.js";
export { renderEvaluateText, renderHarnessError, renderNextText, renderPrepareText, renderRetrieveText } from "./format.js";
export { completionRuleFor, isFinalizeAction } from "./completion.js";

export async function executePrepareTool(
  root: string,
  args: unknown,
  context?: OpenCodeSidecarRuntimeContext,
  recorder?: OpenCodeSidecarRecorder
): Promise<string> {
  return runHarnessTool(
    root,
    "prepare",
    async () => {
      const parsed = parsePrepareArgs(args);
      if (typeof parsed === "string") return renderHarnessError("prepare", parsed, root);
      return renderPrepareText(await preparePluginHarnessTask(root, parsed));
    },
    context,
    recorder
  );
}

export async function executeRetrieveTool(
  root: string,
  args: unknown,
  context?: OpenCodeSidecarRuntimeContext,
  recorder?: OpenCodeSidecarRecorder
): Promise<string> {
  return runHarnessTool(
    root,
    "retrieve",
    async () => {
      const parsed = parseRetrieveArgs(args);
      if (typeof parsed === "string") return renderHarnessError("retrieve", parsed, root);
      return renderRetrieveText(await retrievePluginHarnessContext(root, parsed));
    },
    context,
    recorder
  );
}

export async function executeFeedbackTool(root: string, args: unknown): Promise<string> {
  const parsed = parseFeedbackArgs(args);
  if (typeof parsed === "string") return structuredJson(contextToolFailure("context-feedback", invalidArguments(parsed)));
  return structuredJson(await runContextFeedbackTool({ repo: root, ...parsed }));
}

export async function executeContextSearchTool(root: string, args: unknown): Promise<string> {
  const parsed = parseContextSearchArgs(args);
  if (typeof parsed === "string") return structuredJson(contextToolFailure("context-search", invalidArguments(parsed)));
  return structuredJson(await runContextSearchTool({ repo: root, ...parsed }));
}

export async function executeContextGetTool(root: string, args: unknown): Promise<string> {
  const parsed = parseContextGetArgs(args);
  if (typeof parsed === "string") return structuredJson(contextToolFailure("context-get", invalidArguments(parsed)));
  return structuredJson(
    await runContextGetTool({
      repo: root,
      id: parsed.entryId,
      language: parsed.language,
      packageVersion: parsed.packageVersion,
      source: parsed.source,
      file: parsed.file,
      full: parsed.full,
      withAnnotations: parsed.withAnnotations
    })
  );
}

export async function executeContextStatusTool(root: string, args: unknown): Promise<string> {
  const parsed = parseContextStatusArgs(args);
  if (typeof parsed === "string") return structuredJson(contextToolFailure("context-status", invalidArguments(parsed)));
  const taskId = resolvePluginTaskId(root, parsed.taskId, parsed.sessionId);
  return structuredJson(await runContextStatusTool({ repo: root, ...(taskId ? { taskId } : {}) }));
}

export async function executeInterventionsTool(root: string, args: unknown): Promise<string> {
  const parsed = parseInterventionsArgs(args);
  if (typeof parsed === "string") return structuredJson(contextToolFailure("interventions", invalidArguments(parsed)));
  const taskId = resolvePluginTaskId(root, parsed.taskId, parsed.sessionId);
  if (!taskId) return structuredJson(contextToolFailure("interventions", invalidArguments("interventions requires taskId or a prepared Desktop session.")));
  return structuredJson(await runInterventionsTool({ repo: root, taskId }));
}

export async function executeEvaluateTool(
  root: string,
  args: unknown,
  context?: OpenCodeSidecarRuntimeContext,
  recorder?: OpenCodeSidecarRecorder
): Promise<string> {
  return runHarnessTool(
    root,
    "evaluate",
    async () => {
      const parsed = parseEvaluateArgs(args);
      if (typeof parsed === "string") return renderHarnessError("evaluate", parsed, root);
      const result = await evaluatePluginHarness(root, parsed);
      return typeof result === "string" ? renderHarnessError("evaluate", result) : renderEvaluateText(result);
    },
    context,
    recorder
  );
}

export async function executeNextTool(
  root: string,
  args: unknown,
  context?: OpenCodeSidecarRuntimeContext,
  recorder?: OpenCodeSidecarRecorder
): Promise<string> {
  return runHarnessTool(
    root,
    "next",
    async () => {
      const parsed = parseNextArgs(args);
      if (typeof parsed === "string") return renderHarnessError("next", parsed, root);
      const result = await nextPluginHarnessAction(root, parsed);
      return typeof result === "string" ? renderHarnessError("next", result) : renderNextText(result);
    },
    context,
    recorder
  );
}

async function runHarnessTool(
  root: string,
  tool: "prepare" | "retrieve" | "evaluate" | "next",
  action: () => Promise<string>,
  context?: OpenCodeSidecarRuntimeContext,
  recorder?: OpenCodeSidecarRecorder
): Promise<string> {
  try {
    const output = await action();
    notifyFromToolResult(root, tool, output, context, recorder);
    return output;
  } catch (error) {
    return renderHarnessError(tool, harnessFailureMessage(error), root);
  }
}

function notifyFromToolResult(
  root: string,
  tool: "prepare" | "retrieve" | "evaluate" | "next",
  output: string,
  context?: OpenCodeSidecarRuntimeContext,
  recorder?: OpenCodeSidecarRecorder
): void {
  if (!context) return;
  try {
    const result = JSON.parse(output) as { interventions?: import("./types.js").PluginInterventionSnapshot };
    notifyPluginInterventionSignals(context, result.interventions, tool, recorder);
  } catch (error) {
    recorder?.log("debug", "plugin intervention result notification skipped", { message: error instanceof Error ? error.message : String(error) });
  }
}

function structuredJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
