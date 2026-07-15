import path from "node:path";
import { Command } from "commander";
import { OPENCODE_PLUSPLUS_PACKAGE_VERSION } from "../core/package-info.js";
import { resolveDefaultCommandArgs } from "./default-command.js";
import { registerBenchmarkCommands } from "./commands/benchmark.js";
import { registerContextCommands } from "./commands/context.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerGuardCommands } from "./commands/guards.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerOpencodeCommands } from "./commands/opencode.js";
import { registerOrchestrateCommands } from "./commands/orchestrate.js";
import { registerPolicyCommand } from "./commands/policy.js";
import { registerRagCommands } from "./commands/rag.js";
import { registerReportCommand } from "./commands/report.js";
import { registerSidecarCommands } from "./commands/sidecar.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTaskCommands } from "./commands/task.js";
import { registerTraceCommands } from "./commands/trace.js";
import { registerTuiCommand } from "./commands/tui.js";
import { registerTuiInputCommands } from "./commands/tui-input.js";

export async function runCli(argv = process.argv): Promise<void> {
  const executableName = path.basename(argv[1] ?? "opencode-plusplus").replace(/\.(js|cmd|ps1)$/i, "");
  const invokedName = executableName && executableName !== "index" ? executableName : "opencode-plusplus";
  const program = createCliProgram(invokedName);

  const parseArgs = resolveDefaultCommandArgs({ invokedName, argv });

  await program.parseAsync(parseArgs).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export function createCliProgram(invokedName = "opencode-plusplus"): Command {
  const program = new Command();
  program
    .name(invokedName)
    .description("OpenCode++: add context, boundaries, evidence, and verification gates to coding agents.")
    .version(OPENCODE_PLUSPLUS_PACKAGE_VERSION);

  registerTuiCommand(program, invokedName);
  registerTuiInputCommands(program);
  registerSidecarCommands(program);
  registerReportCommand(program);
  registerStatusCommand(program);
  registerDoctorCommand(program);
  registerOpencodeCommands(program);
  registerContextCommands(program);
  registerTaskCommands(program);
  registerPolicyCommand(program);
  registerGuardCommands(program);
  registerMemoryCommands(program);
  registerTraceCommands(program);
  registerRagCommands(program);
  registerOrchestrateCommands(program);
  registerBenchmarkCommands(program);

  return program;
}
