import type { Command } from "commander";
import { initOpenCodeDesktopProject, renderOpenCodeDesktopInitReport } from "../../integrations/opencode/desktop.js";

interface OpenCodeDesktopInitCliOptions {
  force?: boolean;
  skipContext?: boolean;
  refreshContext?: boolean;
  json?: boolean;
}

export function registerDesktopCommands(program: Command): void {
  const desktop = program.command("desktop").description("Integrate OpenCode++ with the official OpenCode Desktop application.");

  desktop
    .command("init")
    .argument("[repo]", "repository path", ".")
    .option("--force", "overwrite the generated plugin, commands, and agent file")
    .option("--skip-context", "install the Desktop integration without generating .agent-context")
    .option("--refresh-context", "rebuild context even when .agent-context already exists")
    .option("--json", "print a machine-readable initialization report")
    .description("Prepare a repository for OpenCode++ inside OpenCode Desktop without launching the TUI.")
    .action(async (repo: string, options: OpenCodeDesktopInitCliOptions) => {
      const report = await initOpenCodeDesktopProject(repo, options);
      console.log(options.json ? JSON.stringify(report, null, 2) : renderOpenCodeDesktopInitReport(report));
    });
}
