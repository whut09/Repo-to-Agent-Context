import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PLUSPLUS_AGENT } from "../../installer/opencode-plusplus-prompts.js";

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
    "  Select the opencode-plusplus mode in OpenCode Desktop."
  ].join("\n");
}

function opencodeInitTemplates(): Array<{ path: string; content: string }> {
  return [
    {
      path: ".opencode/agents/opencode-plusplus.md",
      content: PLUSPLUS_AGENT
    }
  ];
}

function formatInitFiles(files: OpencodeInitFile[], label: OpencodeInitFile["status"]): string[] {
  if (!files.length) return [];
  return files.map((file) => `- ${file.path} (${label})`);
}
