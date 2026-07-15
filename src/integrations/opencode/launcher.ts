import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildContextPackage } from "../../core/context-builder.js";
import { runGit } from "../../core/git.js";
import { runSafeCommand } from "../../core/safe-command.js";
import { writeContextPackage } from "../../outputs/renderers/writer.js";
import { initOpencodeProject } from "./project-init.js";
import { ensureOpencodeSidecarPlugin } from "./sidecar.js";

export interface OpenCodeLauncherOptions {
  repo?: string;
  forcePlugin?: boolean;
  skipContext?: boolean;
  dryRun?: boolean;
  pure?: boolean;
  onPreflight?: (result: OpenCodeLauncherPreflightResult) => void;
}

export interface OpenCodeLauncherStep {
  name: string;
  status: "pass" | "warn" | "fail" | "skipped";
  details: string;
}

export interface OpenCodeLauncherResult {
  repo: string;
  steps: OpenCodeLauncherStep[];
  command: string[];
  launched: boolean;
  exitCode: number | null;
}

export interface OpenCodeLauncherPreflightResult {
  repo: string;
  steps: OpenCodeLauncherStep[];
  command: string[];
}

export async function launchOpencodeTui(options: OpenCodeLauncherOptions = {}): Promise<OpenCodeLauncherResult> {
  return launchOpenCodeWithSidecar(options);
}

export async function launchOpenCodeWithSidecar(options: OpenCodeLauncherOptions = {}): Promise<OpenCodeLauncherResult> {
  const repo = path.resolve(options.repo ?? ".");
  const steps: OpenCodeLauncherStep[] = [];
  const opencode = checkCommand("opencode --version", repo);
  steps.push({
    name: "opencode",
    status: opencode.ok ? "pass" : "fail",
    details: opencode.ok ? opencode.details : `OpenCode is not available: ${opencode.details}`
  });

  if (options.pure) {
    steps.push({ name: "mode", status: "skipped", details: "pure OpenCode mode; OpenCode++ sidecar disabled" });
    const command = ["opencode", repo];
    if (!opencode.ok) return { repo, steps, command, launched: false, exitCode: 1 };
    if (options.dryRun) return { repo, steps, command, launched: false, exitCode: 0 };
    options.onPreflight?.({ repo, steps, command });
    const result = await spawnOpenCodeTui(repo);
    return { repo, steps, command, launched: true, exitCode: typeof result.status === "number" ? result.status : result.error ? 1 : null };
  }

  const git = checkGitRepo(repo);
  steps.push({
    name: "git",
    status: git.ok ? "pass" : "fail",
    details: git.ok ? "inside git repository" : git.error
  });

  if (steps.some((step) => step.status === "fail")) {
    return { repo, steps, command: ["opencode", repo], launched: false, exitCode: 1 };
  }

  const contextDir = path.join(repo, ".agent-context");
  if (options.skipContext) {
    steps.push({ name: "context", status: "skipped", details: "context generation skipped by option" });
  } else if (existsSync(contextDir)) {
    steps.push({ name: "context", status: "pass", details: ".agent-context already exists" });
  } else {
    const context = await buildContextPackage(repo);
    const written = writeContextPackage(context);
    steps.push({ name: "context", status: "pass", details: `generated ${written.files.length} context file(s)` });
  }

  const opencodeInit = initOpencodeProject(repo, { dryRun: options.dryRun });
  const skipped = opencodeInit.files.filter((file) => file.status === "skipped").length;
  const wouldWrite = opencodeInit.files.filter((file) => file.status === "would-write").length;
  steps.push({
    name: "opencode-project",
    status: "pass",
    details: wouldWrite
      ? `OpenCode commands/agent would be generated (${wouldWrite} file(s))`
      : skipped
        ? `OpenCode commands/agent ready (${skipped} existing file(s) preserved)`
        : "OpenCode commands/agent generated"
  });

  const plugin = ensureOpencodeSidecarPlugin(repo, { force: options.forcePlugin, dryRun: options.dryRun });
  steps.push(plugin);

  const command = ["opencode", repo];
  if (options.dryRun) {
    return { repo, steps, command, launched: false, exitCode: 0 };
  }

  options.onPreflight?.({ repo, steps, command });
  const result = await spawnOpenCodeTui(repo);
  return { repo, steps, command, launched: true, exitCode: typeof result.status === "number" ? result.status : result.error ? 1 : null };
}

export function renderOpenCodeLauncherResult(result: OpenCodeLauncherResult): string {
  return [
    "OpenCode++ OpenCode TUI",
    "",
    `Repo: ${result.repo}`,
    "",
    "Preflight:",
    ...result.steps.map((step) => `- [${step.status.toUpperCase()}] ${step.name}: ${step.details}`),
    "",
    `Command: ${result.command.join(" ")}`,
    result.launched ? `Exit code: ${result.exitCode ?? "unknown"}` : "Launch: skipped"
  ].join("\n");
}

export function renderOpenCodeLauncherPreflight(result: OpenCodeLauncherPreflightResult): string {
  const context = result.steps.find((step) => step.name === "context");
  const plugin = result.steps.find((step) => step.name === "sidecar-plugin");
  const mode = result.steps.find((step) => step.name === "mode");
  const title = mode?.status === "skipped" ? "OpenCode++ launching pure OpenCode" : "OpenCode++ sidecar ready";
  return [
    title,
    `- Context: ${statusWord(context)}${context ? ` (${context.details})` : ""}`,
    `- Plugin: ${mode?.status === "skipped" ? "disabled" : statusWord(plugin)}${plugin ? ` (${plugin.details})` : ""}`,
    `- Report: ${mode?.status === "skipped" ? "disabled" : ".agent-context/sidecar/latest.md"}`,
    "",
    "Launching OpenCode..."
  ].join("\n");
}

export function renderOpenCodeLauncherExit(result: OpenCodeLauncherResult): string {
  return `OpenCode exited with code ${result.exitCode ?? "unknown"}.`;
}

function statusWord(step: OpenCodeLauncherStep | undefined): string {
  if (!step) return "unknown";
  if (step.status === "pass") return "ready";
  return step.status;
}

function checkCommand(command: string, cwd: string): { ok: boolean; details: string } {
  const result = runSafeCommand(command, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  const output = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/).find(Boolean) ?? "";
  return { ok: result.status === 0 && !result.error, details: output || result.error?.message || `exit ${result.status ?? "unknown"}` };
}

function checkGitRepo(repo: string): { ok: boolean; error: string } {
  try {
    return { ok: runGit(repo, ["rev-parse", "--is-inside-work-tree"]).trim() === "true", error: "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function spawnOpenCodeTui(repo: string): Promise<{ status: number | null; error?: Error }> {
  const result = await spawnOpenCodeProcess("opencode", [repo], repo);
  if (!shouldTryWindowsCmdFallback(result.error)) return result;
  return spawnOpenCodeProcess("cmd.exe", ["/d", "/s", "/c", `opencode.cmd ${windowsCmdQuote(repo)}`], repo);
}

function spawnOpenCodeProcess(command: string, args: string[], cwd: string): Promise<{ status: number | null; error?: Error }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
      windowsVerbatimArguments: process.platform === "win32" && /cmd\.exe$/i.test(command)
    });
    let settled = false;

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ status: null, error });
    });

    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      resolve({ status: code });
    });
  });
}

function shouldTryWindowsCmdFallback(error: Error | undefined): boolean {
  return process.platform === "win32" && Boolean(error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
}

function windowsCmdQuote(value: string): string {
  if (value && !/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replace(/(["^])/g, "^$1")}"`;
}
