import type { OpenCodeSidecarRecorder } from "./events.js";
import { checkOpencodeSidecarCommand, renderOpencodeSidecarCommandCheck } from "../sidecar.js";
import { commandFromTool, pathsFromTool } from "./paths.js";

export function runCommandGuard(directory: string, recorder: OpenCodeSidecarRecorder, tool: unknown, args: unknown): void {
  const command = commandFromTool(tool, args);
  const paths = pathsFromTool(args);
  if (!command && paths.length === 0) return;

  const check = checkOpencodeSidecarCommand(directory, { command: command ?? "path-check", paths });
  recorder.record("sidecar.check-command", { tool, command, paths, exitCode: check.allowed ? 0 : 1 });
  if (!check.allowed) {
    recorder.log("error", "blocked tool execution", { tool, command, paths });
    throw new Error(renderOpencodeSidecarCommandCheck(check));
  }
  recorder.log("debug", "tool execution allowed", { tool, command, paths });
}
