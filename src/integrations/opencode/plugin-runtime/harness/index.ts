import { parseEvaluateArgs, parseFeedbackArgs, parseNextArgs, parsePrepareArgs, parseRetrieveArgs } from "./args.js";
import { harnessFailureMessage } from "./error.js";
import { evaluatePluginHarness } from "./evaluate.js";
import { renderEvaluateText, renderHarnessError, renderNextText, renderPrepareText, renderRetrieveText } from "./format.js";
import { nextPluginHarnessAction } from "./next.js";
import { preparePluginHarnessTask } from "./prepare.js";
import { retrievePluginHarnessContext } from "./retrieve.js";
import { submitApplicationContextFeedback } from "../../../../application/context-feedback-service.js";
import type { PluginFeedbackArgs } from "./types.js";
import { notifyPluginInterventionSignals, type OpenCodeSidecarRecorder, type OpenCodeSidecarRuntimeContext } from "../events.js";

export { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "./types.js";
export type { OpenCodePlusPlusPluginToolName } from "./types.js";
export { parseEvaluateArgs, parseNextArgs, parsePrepareArgs, parseRetrieveArgs } from "./args.js";
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
  try {
    const parsed = parseFeedbackArgs(args);
    if (typeof parsed === "string") return JSON.stringify({ ok: false, error: parsed });
    const result = await submitApplicationContextFeedback({ repo: root, ...(parsed as PluginFeedbackArgs) });
    return (
      JSON.stringify(
        {
          ok: true,
          tool: "feedback",
          enabled: result.enabled,
          feedback: result.feedback,
          stats: result.stats,
          transport: result.transport,
          note: "Feedback is separate from annotations and cannot satisfy evidence or change a decision."
        },
        null,
        2
      ) + "\n"
    );
  } catch (error) {
    return (
      JSON.stringify(
        { ok: false, tool: "feedback", error: { code: "FEEDBACK_ERROR", message: error instanceof Error ? error.message : String(error) } },
        null,
        2
      ) + "\n"
    );
  }
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
