import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ContextPackage } from "../../core/types.js";
import { changedFilesSince, runGit } from "../../core/git.js";
import { shellQuote } from "../../core/safe-command.js";
import { currentWorkingTreeHash } from "../observability/execution-trace.js";
import type { ExecResult } from "../../sandbox/sandbox-adapter.js";
import type { TaskRunWriteResult } from "../../outputs/task-run.js";
import type { AgentExecutorInput, AgentExecutorName, AgentExecutorResult, HarnessOrchestratorOptions, HarnessOrchestratorReport } from "./orchestrator.js";

export type AgentExecutor = (input: AgentExecutorInput) => Promise<AgentExecutorResult>;

export function createAgentExecutor(name: AgentExecutorName): AgentExecutor {
  return async (input) => {
    if (input.dryRun || name === "mock") return runMockExecutor(name, input);
    if (!input.executorCommand) {
      return {
        executor: name,
        exitCode: 2,
        stdout: "",
        stderr: `No executor command configured for ${name}. Pass --executor-command with placeholders such as {prompt}, {task}, {repo}, and {runDir}.`,
        changedFiles: collectChangedFiles(input.repo, input.base),
        modifiedFiles: [],
        sandboxMode: input.sandboxHandle.mode,
        sandboxRoot: input.sandboxHandle.root
      };
    }
    return runShellExecutor(name, input);
  };
}

export function buildExecutorPrompt(
  context: ContextPackage,
  taskRun: TaskRunWriteResult,
  executorName: AgentExecutorName,
  options: HarnessOrchestratorOptions,
  previousDecision: HarnessOrchestratorReport["decision"] | undefined,
  loopIndex: number
): string {
  const promptFile = promptFileFor(context.scan.root, taskRun.runId, executorName);
  const basePrompt = existsSync(promptFile)
    ? readFileSync(promptFile, "utf8")
    : [
        `Task: ${taskRun.manifest.task}`,
        `Run directory: ${path.relative(context.scan.root, taskRun.dir).replaceAll("\\", "/")}`,
        "Read plan.md, edit-boundary.md, pack.md, tests.md, impact.md, then make the minimal code change."
      ].join("\n");

  return [
    basePrompt.trim(),
    "",
    "Harness control-plane requirements:",
    "- OpenCode++ provides context, boundaries, trace evidence, policy, impact, verify, and final gate decision reports.",
    "- The selected code agent owns reading source files, editing code, and running commands.",
    "- Inspect relevant source files before behavior-changing edits.",
    "- Keep changes inside the edit boundary unless the task cannot be completed otherwise.",
    "- Prefer command evidence for tests and verification.",
    `- Executor: ${executorName}`,
    `- Loop iteration: ${loopIndex} / ${options.maxLoops ?? 1}`,
    ...(previousDecision
      ? [
          "",
          "Previous harness decision:",
          `- Action: ${previousDecision.action}`,
          ...previousDecision.reasons.map((reason) => `- Reason: ${reason}`),
          ...previousDecision.requiredCommands.map((command) => `- Suggested command: ${command}`)
        ].filter(Boolean)
      : [])
  ].join("\n");
}

export function collectChangedFiles(root: string, base: string): string[] {
  const files = new Set<string>();
  try {
    for (const file of changedFilesSince(root, base)) if (!isHarnessGeneratedPath(file)) files.add(file);
  } catch {
    // Status-only collection below still captures useful local evidence.
  }
  try {
    for (const line of runGit(root, ["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/)) {
      if (line.length <= 3) continue;
      const file = line.slice(3).trim().replace(/\\/g, "/").split(" -> ").pop();
      if (file && !isHarnessGeneratedPath(file)) files.add(file);
    }
  } catch {
    return [...files].sort();
  }
  return [...files].sort();
}

async function runMockExecutor(name: AgentExecutorName, input: AgentExecutorInput): Promise<AgentExecutorResult> {
  const startedAt = new Date().toISOString();
  const workingTreeHashBefore = currentWorkingTreeHash(input.repo);
  const eventsPath = path.join(input.runDir, "executor.mock.json");
  writeFileSync(
    eventsPath,
    `${JSON.stringify({ executor: name, task: input.task, dryRun: true, note: "Mock executor does not edit files. It exercises the harness-led orchestration path." }, null, 2)}\n`,
    "utf8"
  );
  const diffPath = writePatchSnapshot(input.hostRepo, input.runDir, "mock", await input.sandbox.exportPatch());
  const finishedAt = new Date().toISOString();
  const workingTreeHashAfter = currentWorkingTreeHash(input.repo);
  const stdout = "mock executor completed without editing files";
  const stderr = "";
  return {
    executor: name,
    exitCode: 0,
    eventsPath: path.relative(input.hostRepo, eventsPath).replaceAll("\\", "/"),
    stdout,
    stderr,
    changedFiles: collectChangedFiles(input.repo, input.base),
    modifiedFiles: [],
    diffPath,
    startedAt,
    finishedAt,
    stdoutHash: hashText(stdout),
    stderrHash: hashText(stderr),
    workingTreeHashBefore,
    workingTreeHashAfter,
    sandboxMode: input.sandboxHandle.mode,
    sandboxRoot: input.sandboxHandle.root
  };
}

async function runShellExecutor(name: AgentExecutorName, input: AgentExecutorInput): Promise<AgentExecutorResult> {
  const command = expandExecutorCommand(input.executorCommand ?? "", input);
  input.onProgress?.({ at: new Date().toISOString(), phase: "execute", message: `executor command: ${command}` });
  const startedHash = currentWorkingTreeHash(input.repo);
  const filesBefore = changedFileSnapshot(input.repo, input.base);
  const startedAt = new Date().toISOString();
  let result: ExecResult;
  try {
    result = await input.sandbox.execute(command, {
      timeoutMs: input.executorTimeoutMs,
      idleTimeoutMs: input.executorIdleTimeoutMs,
      onStdout: (text) => input.onExecutorOutput?.({ stream: "stdout", text }),
      onStderr: (text) => input.onExecutorOutput?.({ stream: "stderr", text })
    });
  } catch (error) {
    result = {
      command,
      file: "",
      args: [],
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      status: 2,
      error: error instanceof Error ? error : undefined
    };
  }
  const finishedAt = new Date().toISOString();
  const finishedHash = currentWorkingTreeHash(input.repo);
  const filesAfter = changedFileSnapshot(input.repo, input.base);
  const stdout = result.stdout;
  const stderr = result.stderr;
  const exitCode = result.status;
  const eventsPath = writeExecutorEvents(input.hostRepo, input.runDir, name, {
    command,
    exitCode,
    startedAt,
    finishedAt,
    workingTreeHashBefore: startedHash,
    workingTreeHashAfter: finishedHash,
    stdoutHash: hashText(stdout),
    stderrHash: hashText(stderr)
  });
  const diffPath = writePatchSnapshot(input.hostRepo, input.runDir, name, await input.sandbox.exportPatch());
  return {
    executor: name,
    exitCode,
    command,
    eventsPath,
    stdout,
    stderr,
    changedFiles: collectChangedFiles(input.repo, input.base),
    modifiedFiles: modifiedFilesBetween(filesBefore, filesAfter),
    diffPath,
    startedAt,
    finishedAt,
    stdoutHash: hashText(stdout),
    stderrHash: hashText(stderr),
    workingTreeHashBefore: startedHash,
    workingTreeHashAfter: finishedHash,
    sandboxMode: input.sandboxHandle.mode,
    sandboxRoot: input.sandboxHandle.root
  };
}

function promptFileFor(root: string, runId: string, executorName: AgentExecutorName): string {
  const promptName =
    executorName === "claude-code"
      ? "prompt.claude.md"
      : executorName === "cursor"
        ? "prompt.cursor.md"
        : executorName === "codex"
          ? "prompt.codex.md"
          : "prompt.opencode.md";
  return path.join(root, ".agent-context", "runs", runId, promptName);
}

function expandExecutorCommand(command: string, input: AgentExecutorInput): string {
  const promptFile = path.join(input.runDir, "executor-prompt.md");
  writeFileSync(promptFile, `${input.prompt.trim()}\n`, "utf8");
  const executorPromptFile = writeExecutorPromptForRepo(input, promptFile);
  const replacements: Record<string, string> = {
    "{prompt}": shellQuote(executorPromptFile),
    "{task}": shellQuote(input.task),
    "{repo}": shellQuote(input.repo),
    "{runDir}": shellQuote(input.runDir),
    "{agent}": shellQuote(input.agent ?? "")
  };
  let expanded = command;
  for (const [token, value] of Object.entries(replacements)) expanded = expanded.replaceAll(token, value);
  return expanded;
}

function writeExecutorPromptForRepo(input: AgentExecutorInput, hostPromptFile: string): string {
  if (path.resolve(input.repo) === path.resolve(input.hostRepo)) return hostPromptFile;
  const promptDir = path.join(input.repo, ".agent-context", "executor-prompts", input.runId);
  mkdirSync(promptDir, { recursive: true });
  const promptFile = path.join(promptDir, path.basename(input.runDir));
  writeFileSync(promptFile, readFileSync(hostPromptFile, "utf8"), "utf8");
  return promptFile;
}

function writeExecutorEvents(root: string, runDir: string, executor: AgentExecutorName, event: Record<string, string | number | null>): string {
  const filePath = path.join(runDir, `executor.${executor}.json`);
  writeFileSync(filePath, `${JSON.stringify({ executor, ...event }, null, 2)}\n`, "utf8");
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function writePatchSnapshot(hostRoot: string, runDir: string, executor: AgentExecutorName, patch: string): string {
  const filePath = path.join(runDir, `diff.${executor}.patch`);
  writeFileSync(filePath, patch, "utf8");
  return path.relative(hostRoot, filePath).replaceAll("\\", "/");
}

function isHarnessGeneratedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized === "AGENTS.md" || normalized.startsWith(".agent-context/");
}

function changedFileSnapshot(root: string, base: string): Map<string, string> {
  return new Map(
    collectChangedFiles(root, base).map((file) => {
      const filePath = path.join(root, file);
      return [file, existsSync(filePath) ? createHash("sha256").update(readFileSync(filePath)).digest("hex") : "<deleted>"];
    })
  );
}

function modifiedFilesBetween(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((file) => before.get(file) !== after.get(file)).sort();
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
