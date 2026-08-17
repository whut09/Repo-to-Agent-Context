import type { OpenCodeSidecarRecorder } from "./events.js";
import { runOpenCodePlusPlusCli } from "./cli-runner.js";
import { commandFromTool, pathsFromTool } from "./paths.js";

export function runCommandGuard(directory: string, recorder: OpenCodeSidecarRecorder, tool: unknown, args: unknown): void {
  const command = commandFromTool(tool, args);
  const paths = pathsFromTool(args);
  if (!command && paths.length === 0) return;

  const cliArgs = ["sidecar", "check-command", directory, "--json"];
  if (command) cliArgs.push("--command", command);
  else cliArgs.push("--command", "path-check");
  for (const file of paths) cliArgs.push("--path", file);

  const check = runOpenCodePlusPlusCli(cliArgs, directory);
  recorder.record("sidecar.check-command", { tool, command, paths, exitCode: check.status ?? 1 });
  if ((check.status ?? 1) !== 0) {
    const output = (check.stdout || check.stderr || "OpenCode++ blocked a command or protected path.").trim();
    recorder.log("error", "blocked tool execution", { tool, command, paths });
    throw new Error(output);
  }
  recorder.log("debug", "tool execution allowed", { tool, command, paths });
}
