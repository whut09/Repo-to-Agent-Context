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
  const patterns: Array<[RegExp, string]> = [
    [/\brm\s+(-[^\s]*[rf][^\s]*|-[^\s]*r[^\s]*f[^\s]*|-[^\s]*f[^\s]*r[^\s]*)\s+(\/|\*|\.|~|\$HOME|%USERPROFILE%)/i, "destructive recursive remove"],
    [/\bgit\s+reset\s+--hard\b/i, "hard git reset"],
    [/\bgit\s+clean\s+-[^\s]*[fd][^\s]*/i, "git clean removes untracked files"],
    [/\b(curl|wget)\b.+\|\s*(sh|bash|powershell|pwsh)\b/i, "remote script pipe to shell"],
    [/\bchmod\s+-R\s+777\b/i, "recursive world-writable permissions"],
    [/\bdel\s+\/[sfq]\s+(\\|\/|\*)/i, "destructive Windows delete"]
  ];
  for (const [pattern, reason] of patterns) {
    if (pattern.test(command))
      findings.push({ kind: "dangerous_command", severity: "blocker", message: `Blocked dangerous command: ${reason}`, evidence: [command] });
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
        message: "Blocked command with unsupported shell control syntax. Use a plain executable plus arguments.",
        evidence: [command]
      }
    ];
  }
  const script = npmScriptName(parsed.file, parsed.args);
  if (!script) return [];
  const scripts = readPackageScripts(root);
  if (script in scripts) return [];
  return [
    {
      kind: "unknown_script",
      severity: "blocker",
      message: `Package script does not exist: ${script}`,
      evidence: [`package.json scripts: ${Object.keys(scripts).sort().join(", ") || "none"}`]
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
