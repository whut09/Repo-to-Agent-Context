import { parseEvaluateArgs, parseNextArgs, parsePrepareArgs, parseRetrieveArgs } from "./args.js";
import { harnessFailureMessage } from "./error.js";
import { evaluatePluginHarness } from "./evaluate.js";
import { renderEvaluateText, renderHarnessError, renderNextText, renderPrepareText, renderRetrieveText } from "./format.js";
import { nextPluginHarnessAction } from "./next.js";
import { preparePluginHarnessTask } from "./prepare.js";
import { retrievePluginHarnessContext } from "./retrieve.js";

export { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "./types.js";
export type { OpenCodePlusPlusPluginToolName } from "./types.js";
export { parseEvaluateArgs, parseNextArgs, parsePrepareArgs, parseRetrieveArgs } from "./args.js";
export { renderEvaluateText, renderHarnessError, renderNextText, renderPrepareText, renderRetrieveText } from "./format.js";
export { completionRuleFor, isFinalizeAction } from "./completion.js";

export async function executePrepareTool(root: string, args: unknown): Promise<string> {
  return runHarnessTool("prepare", async () => {
    const parsed = parsePrepareArgs(args);
    if (typeof parsed === "string") return renderHarnessError("prepare", parsed);
    return renderPrepareText(await preparePluginHarnessTask(root, parsed));
  });
}

export async function executeRetrieveTool(root: string, args: unknown): Promise<string> {
  return runHarnessTool("retrieve", async () => {
    const parsed = parseRetrieveArgs(args);
    if (typeof parsed === "string") return renderHarnessError("retrieve", parsed);
    return renderRetrieveText(await retrievePluginHarnessContext(root, parsed));
  });
}

export async function executeEvaluateTool(root: string, args: unknown): Promise<string> {
  return runHarnessTool("evaluate", async () => {
    const parsed = parseEvaluateArgs(args);
    if (typeof parsed === "string") return renderHarnessError("evaluate", parsed);
    const result = await evaluatePluginHarness(root, parsed);
    return typeof result === "string" ? renderHarnessError("evaluate", result) : renderEvaluateText(result);
  });
}

export async function executeNextTool(root: string, args: unknown): Promise<string> {
  return runHarnessTool("next", async () => {
    const parsed = parseNextArgs(args);
    if (typeof parsed === "string") return renderHarnessError("next", parsed);
    const result = await nextPluginHarnessAction(root, parsed);
    return typeof result === "string" ? renderHarnessError("next", result) : renderNextText(result);
  });
}

async function runHarnessTool(tool: string, action: () => Promise<string>): Promise<string> {
  try {
    return await action();
  } catch (error) {
    return renderHarnessError(tool, harnessFailureMessage(error));
  }
}
