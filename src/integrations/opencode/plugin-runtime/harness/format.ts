import { createPluginHarnessError, renderPluginHarnessResult } from "./protocol.js";
import type { PluginHarnessResult } from "./types.js";

export function renderPrepareText(result: PluginHarnessResult): string {
  return renderPluginResult(result);
}

export function renderRetrieveText(result: PluginHarnessResult): string {
  return renderPluginResult(result);
}

export function renderEvaluateText(result: PluginHarnessResult): string {
  return renderPluginResult(result);
}

export function renderNextText(result: PluginHarnessResult): string {
  return renderPluginResult(result);
}

export function renderPluginResult(result: PluginHarnessResult): string {
  return renderPluginHarnessResult(result);
}

export function renderHarnessError(tool: string, message: string, root = "."): string {
  return renderPluginHarnessResult(createPluginHarnessError(root, tool as "prepare" | "retrieve" | "evaluate" | "next", message));
}
