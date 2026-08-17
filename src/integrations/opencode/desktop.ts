import { existsSync } from "node:fs";
import path from "node:path";
import { buildContextPackage } from "../../core/context-builder.js";
import { runGit } from "../../core/git.js";
import { writeContextPackage } from "../../outputs/renderers/writer.js";
import { initOpencodeProject, type OpencodeInitReport } from "./project-init.js";
import { ensureOpencodeSidecarPlugin, type OpenCodeSidecarStep } from "./sidecar.js";

export interface OpenCodeDesktopInitOptions {
  force?: boolean;
  skipContext?: boolean;
  refreshContext?: boolean;
}

export interface OpenCodeDesktopContextResult {
  status: "generated" | "ready" | "refreshed" | "skipped";
  filesWritten: number;
  details: string;
}

export interface OpenCodeDesktopInitReport {
  repo: string;
  context: OpenCodeDesktopContextResult;
  project: OpencodeInitReport;
  plugin: OpenCodeSidecarStep;
}

export async function initOpenCodeDesktopProject(repo = ".", options: OpenCodeDesktopInitOptions = {}): Promise<OpenCodeDesktopInitReport> {
  const root = path.resolve(repo);
  assertGitRepository(root);
  if (options.skipContext && options.refreshContext) {
    throw new Error("--skip-context and --refresh-context cannot be used together.");
  }

  const context = await prepareContext(root, options);
  const project = initOpencodeProject(root, { force: options.force });
  const plugin = ensureOpencodeSidecarPlugin(root, { force: options.force });
  return { repo: root, context, project, plugin };
}

export function renderOpenCodeDesktopInitReport(report: OpenCodeDesktopInitReport): string {
  return [
    "OpenCode++ OpenCode Desktop Init",
    "",
    `Repo: ${report.repo}`,
    `Context: ${report.context.status} (${report.context.details})`,
    `Plugin: ${report.plugin.details}`,
    "",
    "OpenCode project files:",
    ...report.project.files.map((file) => `- ${file.path} (${file.status})`),
    "",
    "Next:",
    "1. Open or reload this repository in OpenCode Desktop.",
    "2. Start a chat and let OpenCode read, edit, or run a command.",
    "3. Run `opencode-plusplus status .` and `opencode-plusplus report .` from a terminal."
  ].join("\n");
}

async function prepareContext(root: string, options: OpenCodeDesktopInitOptions): Promise<OpenCodeDesktopContextResult> {
  if (options.skipContext) {
    return { status: "skipped", filesWritten: 0, details: "context generation skipped by option" };
  }

  const contextExists = existsSync(path.join(root, ".agent-context"));
  if (contextExists && !options.refreshContext) {
    return { status: "ready", filesWritten: 0, details: ".agent-context already exists" };
  }

  const context = await buildContextPackage(root);
  const written = writeContextPackage(context);
  const status = contextExists ? "refreshed" : "generated";
  return { status, filesWritten: written.files.length, details: `${written.files.length} context file(s) written` };
}

function assertGitRepository(root: string): void {
  try {
    if (runGit(root, ["rev-parse", "--is-inside-work-tree"]).trim() === "true") return;
  } catch (error) {
    void error;
  }
  throw new Error(`OpenCode Desktop integration requires a Git repository: ${root}`);
}
