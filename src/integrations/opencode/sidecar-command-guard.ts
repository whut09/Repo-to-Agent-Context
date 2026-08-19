import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCommandLine } from "../../core/safe-command.js";
import { checkProtectedPath, normalizeToolPath } from "./sidecar-path-guard.js";
import type { OpenCodeSidecarCommandCheckResult, OpenCodeSidecarCommandFinding } from "./sidecar.js";

export function checkSidecarCommand(repo = ".", input: { command?: string; paths?: string[] } = {}): OpenCodeSidecarCommandCheckResult {
  const root = path.resolve(repo);
  const command = input.command?.trim() || null;
  const paths = (input.paths ?? []).map(normalizeToolPath).filter(Boolean);
  const findings: OpenCodeSidecarCommandFinding[] = [];
  if (command) {
    findings.push(...checkDangerousCommand(command));
    findings.push(...checkScriptCommand(root, command));
    findings.push(...checkMakeCommand(root, command));
    findings.push(...checkPyprojectCommand(root, command));
    for (const pathFromCommand of extractPathLikeArguments(command)) findings.push(...checkProtectedPath(pathFromCommand));
  }
  for (const filePath of paths) findings.push(...checkProtectedPath(filePath));
  const unique = dedupeFindings(findings);
  return { repo: root, command, paths, allowed: !unique.some((finding) => finding.severity === "blocker"), findings: unique };
}

function checkDangerousCommand(command: string): OpenCodeSidecarCommandFinding[] {
  const findings: OpenCodeSidecarCommandFinding[] = [];
  const patterns: Array<[RegExp, string, string]> = [
    [
      /\brm\s+(-[^\s]*[rf][^\s]*|-[^\s]*r[^\s]*f[^\s]*|-[^\s]*f[^\s]*r[^\s]*)\s+(\/|\*|\.|~|\$HOME|%USERPROFILE%)/i,
      "Destructive recursive remove 破坏性递归删除",
      "Remove specific files inside the repository, e.g. `rm src/tmp.txt`. 只删除仓库内明确文件，不要递归删 /、~、*。"
    ],
    [
      /\bgit\s+reset\s+--hard\b/i,
      "Hard git reset 破坏性硬重置",
      "Discard one file with `git checkout -- <file>`, or keep changes and call opencode_plusplus_evaluate first. 不要整仓硬重置，先看评估结果。"
    ],
    [
      /\bgit\s+clean\s+-[^\s]*[fd][^\s]*/i,
      "git clean removes untracked files 删除未跟踪文件",
      "Remove specific untracked files by name. 按文件名删除，不要用 git clean。"
    ],
    [
      /\b(curl|wget)\b.+\|\s*(sh|bash|powershell|pwsh)\b/i,
      "Remote script piped to shell 远程脚本管道执行",
      "Download the script into the repository, inspect it, then run it as a plain command. 先下载并检查脚本再显式运行。"
    ],
    [
      /\bchmod\s+-R\s+777\b/i,
      "Recursive world-writable permissions 递归全局可写权限",
      "Set permissions on specific files, e.g. `chmod 755 path/to/file`. 对明确文件单独设置权限。"
    ],
    [
      /\bdel\s+\/[sfq]\s+(\\|\/|\*)/i,
      "Destructive Windows delete Windows 破坏性删除",
      "Delete specific files with `del path\\to\\file` or the edit tool. 只删除明确文件。"
    ]
  ];
  for (const [pattern, reason, doInstead] of patterns) {
    if (pattern.test(command))
      findings.push({ kind: "dangerous_command", severity: "blocker", message: reason, doInstead, evidence: [command] });
  }
  return findings;
}

function checkScriptCommand(root: string, command: string): OpenCodeSidecarCommandFinding[] {
  const parsed = parseCommandSafely(command);
  if (!parsed) {
    return [
      {
        kind: "dangerous_command",
        severity: "blocker",
        message: "Unsupported shell control syntax 不支持的 shell 控制语法",
        doInstead:
          "Run one plain executable with arguments; split chained steps into separate tool calls. 拆成多个单独工具调用，不要用 ; && |。",
        evidence: [command]
      }
    ];
  }
  const script = npmScriptName(parsed.file, parsed.args);
  if (!script) return [];
  const scripts = readPackageScripts(root);
  if (script in scripts) return [];
  const names = Object.keys(scripts).sort();
  const shown = names.slice(0, 12);
  const more = names.length - shown.length;
  return [
    {
      kind: "unknown_script",
      severity: "blocker",
      message: `Unknown package script 未知的 npm script: ${script}`,
      doInstead: `Run one of the existing package.json scripts: ${shown.join(", ") || "none"}${more > 0 ? `, +${more} more` : ""}. 用 package.json 里已有的 script。`,
      evidence: [`package.json scripts: ${shown.join(", ") || "none"}${more > 0 ? `, +${more} more` : ""}`]
    }
  ];
}

function checkMakeCommand(root: string, command: string): OpenCodeSidecarCommandFinding[] {
  const parsed = parseCommandSafely(command);
  if (!parsed || !/^(make|gmake)$/i.test(parsed.file)) return [];
  const target = parsed.args.find((arg) => arg && !arg.startsWith("-")) ?? "all";
  const targets = readMakeTargets(root);
  if (!targets.length) return [{ kind: "unknown_make_target", severity: "blocker", message: "Makefile not found for make command.", evidence: [command] }];
  if (targets.includes(target)) return [];
  return [
    {
      kind: "unknown_make_target",
      severity: "blocker",
      message: `Make target does not exist: ${target}`,
      evidence: [`Makefile targets: ${targets.join(", ")}`]
    }
  ];
}

function checkPyprojectCommand(root: string, command: string): OpenCodeSidecarCommandFinding[] {
  const parsed = parseCommandSafely(command);
  if (!parsed) return [];
  const scripts = readPyprojectScripts(root);
  if (!scripts.length || scripts.includes(parsed.file)) return [];
  return [];
}

function parseCommandSafely(command: string): { file: string; args: string[] } | null {
  try {
    return parseCommandLine(command);
  } catch {
    return null;
  }
}

function npmScriptName(file: string, args: string[]): string | null {
  const normalized = path
    .basename(file)
    .replace(/\.(cmd|ps1|bat|exe)$/i, "")
    .toLowerCase();
  if (["npm", "pnpm", "bun"].includes(normalized)) {
    if (args[0] === "run" && args[1]) return args[1];
    if (["test", "start", "restart", "stop"].includes(args[0] ?? "")) return args[0] ?? null;
  }
  if (normalized === "yarn") {
    if (args[0] === "run" && args[1]) return args[1];
    if (args[0] && !args[0].startsWith("-")) return args[0];
  }
  return null;
}

function readPackageScripts(root: string): Record<string, string> {
  const packagePath = path.join(root, "package.json");
  if (!existsSync(packagePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { scripts?: Record<string, unknown> };
    return Object.fromEntries(Object.entries(parsed.scripts ?? {}).filter(([, value]) => typeof value === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

function readMakeTargets(root: string): string[] {
  const makefile = ["Makefile", "makefile", "GNUmakefile"].map((name) => path.join(root, name)).find(existsSync);
  if (!makefile) return [];
  const targets = new Set<string>();
  for (const line of readFileSync(makefile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:(?![=])/);
    if (match?.[1] && !match[1].startsWith(".")) targets.add(match[1]);
  }
  return [...targets].sort();
}

function readPyprojectScripts(root: string): string[] {
  const pyproject = path.join(root, "pyproject.toml");
  if (!existsSync(pyproject)) return [];
  const scripts = new Set<string>();
  let section = "";
  for (const line of readFileSync(pyproject, "utf8").split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1] ?? "";
      continue;
    }
    if (!["project.scripts", "tool.poetry.scripts"].includes(section)) continue;
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
    if (match?.[1]) scripts.add(match[1]);
  }
  return [...scripts].sort();
}

function extractPathLikeArguments(command: string): string[] {
  const parsed = parseCommandSafely(command);
  if (!parsed) return [];
  return parsed.args.filter((arg) => /(^\.?\.?\/|\\|\.env|AGENTS\.md|\.agent-context|node_modules|dist\/|coverage\/)/i.test(arg)).map(normalizeToolPath);
}

function dedupeFindings(findings: OpenCodeSidecarCommandFinding[]): OpenCodeSidecarCommandFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.kind}:${finding.severity}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
