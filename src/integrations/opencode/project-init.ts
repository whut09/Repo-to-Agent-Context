import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PLUSPLUS_TASK_COMMAND,
  PLUSPLUS_TASK_COMMAND_FILE,
  PLUSPLUS_VERIFY_COMMAND,
  PLUSPLUS_VERIFY_COMMAND_FILE
} from "../../installer/opencode-plusplus-prompts.js";

export interface OpencodeInitOptions {
  force?: boolean;
  dryRun?: boolean;
}

export interface OpencodeInitFile {
  path: string;
  status: "written" | "skipped" | "would-write";
  reason?: string;
}

export interface OpencodeInitReport {
  repo: string;
  files: OpencodeInitFile[];
}

export function initOpencodeProject(repo: string, options: OpencodeInitOptions = {}): OpencodeInitReport {
  const root = path.resolve(repo);
  const files = opencodeInitTemplates().map((template): OpencodeInitFile => {
    const absolutePath = path.join(root, template.path);
    if (existsSync(absolutePath) && !options.force) {
      return { path: template.path, status: "skipped", reason: "file already exists; pass --force to overwrite" };
    }

    if (options.dryRun) {
      return { path: template.path, status: "would-write" };
    }

    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, `${template.content.trim()}\n`, "utf8");
    return { path: template.path, status: "written" };
  });

  return { repo: root, files };
}

export function renderOpencodeInitReport(report: OpencodeInitReport): string {
  const written = report.files.filter((file) => file.status === "written");
  const skipped = report.files.filter((file) => file.status === "skipped");
  const wouldWrite = report.files.filter((file) => file.status === "would-write");
  return [
    "OpenCode++ OpenCode Init",
    "",
    `Repo: ${report.repo}`,
    "",
    "Generated OpenCode project integration files:",
    ...formatInitFiles(written, "written"),
    ...formatInitFiles(wouldWrite, "would-write"),
    ...(skipped.length ? ["", "Skipped:", ...skipped.map((file) => `- ${file.path} (${file.reason ?? "skipped"})`)] : []),
    "",
    "Next:",
    "  opencode",
    "  /plusplus-task <task>",
    "  /plusplus-verify"
  ].join("\n");
}

function opencodeInitTemplates(): Array<{ path: string; content: string }> {
  return [
    {
      path: `.opencode/commands/${PLUSPLUS_TASK_COMMAND_FILE}`,
      content: PLUSPLUS_TASK_COMMAND
    },
    {
      path: `.opencode/commands/${PLUSPLUS_VERIFY_COMMAND_FILE}`,
      content: PLUSPLUS_VERIFY_COMMAND
    },
    {
      path: ".opencode/agents/opencode-plusplus.md",
      content: `---
description: Use OpenCode as the executor under the OpenCode++ reliability harness
---

# OpenCode++ Executor Agent

You are operating as a coding-agent executor under OpenCode++.

OpenCode++ owns task preparation, edit boundaries, evidence checks, and the final decision. OpenCode owns reading source files, editing code, and running commands.

Operating rules:

- Start concrete coding tasks with the /plusplus-task command or the opencode_plusplus_prepare tool.
- Read every mustInspect file before behavior-changing edits; generated summaries are guidance, not source of truth.
- Keep edits inside allowedEditGlobs unless the evaluation explicitly requires expansion.
- Run every requiredCommands entry with the built-in shell tool before calling opencode_plusplus_evaluate.
- Treat a blocking evaluation as an active gate: fix the findings, run the required commands, and evaluate again.
- Present the task as complete only when opencode_plusplus_next returns nextAction as finalize.
- Do not claim tests passed without command evidence after the final edit.`
    }
  ];
}

function formatInitFiles(files: OpencodeInitFile[], label: OpencodeInitFile["status"]): string[] {
  if (!files.length) return [];
  return files.map((file) => `- ${file.path} (${label})`);
}
