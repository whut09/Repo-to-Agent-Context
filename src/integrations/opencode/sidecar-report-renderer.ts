import path from "node:path";

interface Check {
  status: string;
  name: string;
  details: string;
}

interface GuardStack {
  ran: boolean;
  passed: boolean;
  base: string;
  error?: string;
  contracts?: { passed: boolean; violations: number };
  hallucination?: { errors: number; warnings: number };
  regression?: { matches: number; missingRequiredTestEvidence: number };
  impact?: { risk: string; changedFiles: number; relatedTests: number };
  tests?: { minimalCommands: number; recommendedCommands: number; fullConfidenceCommands: number };
  policy?: { passed: boolean; forbidden: number; requiredMissing: number; risks: number };
}

export function renderCommandCheck(result: {
  command: string | null;
  paths: string[];
  allowed: boolean;
  findings: Array<{ severity: string; message: string }>;
}): string {
  return [
    "OpenCode++ Sidecar Command Check",
    "",
    `Command: ${result.command ?? "none"}`,
    `Paths: ${result.paths.length ? result.paths.join(", ") : "none"}`,
    `Result: ${result.allowed ? "allow" : "block"}`,
    "",
    "Findings:",
    ...(result.findings.length ? result.findings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.message}`) : ["- none"])
  ].join("\n");
}

export function renderToolRecord(result: {
  repo: string;
  tracePath: string;
  eventLogPath: string;
  event: { tool: string; command: string | null; exitCode: number | null; filesTouched: string[] };
}): string {
  return [
    "OpenCode++ Sidecar Tool Record",
    "",
    `Tool: ${result.event.tool}`,
    `Command: ${result.event.command ?? "none"}`,
    `Exit code: ${result.event.exitCode ?? "unknown"}`,
    `Trace: ${path.relative(result.repo, result.tracePath).replaceAll("\\", "/")}`,
    `Event log: ${path.relative(result.repo, result.eventLogPath).replaceAll("\\", "/")}`,
    "",
    "Files touched:",
    ...(result.event.filesTouched.length ? result.event.filesTouched.map((file) => `- ${file}`) : ["- none"])
  ].join("\n");
}

export function renderVerifyReport(result: {
  repo: string;
  pluginPath: string;
  eventLogPath: string;
  checks: Check[];
  changedFiles: string[];
  blockers: string[];
  warnings: string[];
  guardStack: GuardStack;
  ok: boolean;
}): string {
  return [
    "OpenCode++ OpenCode Sidecar Verify",
    "",
    `Repo: ${result.repo}`,
    `Plugin: ${path.relative(result.repo, result.pluginPath)}`,
    `Event log: ${path.relative(result.repo, result.eventLogPath)}`,
    "",
    "Checks:",
    ...result.checks.map((check) => `- [${check.status.toUpperCase()}] ${check.name}: ${check.details}`),
    "",
    "Changed files:",
    ...(result.changedFiles.length ? result.changedFiles.map((file) => `- ${file}`) : ["- none"]),
    "",
    "Blockers:",
    ...(result.blockers.length ? result.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "Warnings:",
    ...(result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "Guard stack:",
    ...formatGuardStackLines(result.guardStack),
    "",
    result.ok ? "Result: ready" : "Result: failed"
  ].join("\n");
}

export function renderLatestMarkdown(result: {
  generatedAt: string;
  ok: boolean;
  changedFiles: string[];
  blockers: string[];
  warnings: string[];
  guardStack: GuardStack;
  checks: Check[];
}): string {
  return [
    "# OpenCode++ Sidecar Latest",
    "",
    `Generated: ${result.generatedAt}`,
    `Result: ${result.ok ? "ready" : "blocked"}`,
    "",
    "## Changed Files",
    ...(result.changedFiles.length ? result.changedFiles.map((file) => `- \`${file}\``) : ["- none"]),
    "",
    "## Blockers",
    ...(result.blockers.length ? result.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "## Warnings",
    ...(result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Guard Stack",
    ...formatGuardStackLines(result.guardStack),
    "",
    "## Checks",
    ...result.checks.map((check) => `- **${check.status.toUpperCase()}** ${check.name}: ${check.details}`)
  ].join("\n");
}

export function formatGuardStackLines(summary: GuardStack): string[] {
  if (!summary.ran) return [`- failed to run: ${summary.error ?? "unknown error"}`];
  return [
    `- passed: ${summary.passed ? "yes" : "no"}`,
    `- base: ${summary.base}`,
    `- contracts: ${summary.contracts?.passed ? "passed" : "failed"} (${summary.contracts?.violations ?? 0} violation(s))`,
    `- hallucination: ${summary.hallucination?.errors ?? 0} error(s), ${summary.hallucination?.warnings ?? 0} warning(s)`,
    `- regression: ${summary.regression?.matches ?? 0} match(es), ${summary.regression?.missingRequiredTestEvidence ?? 0} missing evidence`,
    `- impact: ${summary.impact?.risk ?? "unknown"} (${summary.impact?.changedFiles ?? 0} changed file(s), ${summary.impact?.relatedTests ?? 0} related test(s))`,
    `- tests: ${summary.tests?.minimalCommands ?? 0} minimal, ${summary.tests?.recommendedCommands ?? 0} recommended, ${summary.tests?.fullConfidenceCommands ?? 0} full-confidence command(s)`,
    `- policy: ${summary.policy?.passed ? "passed" : "failed"} (${summary.policy?.forbidden ?? 0} forbidden, ${summary.policy?.requiredMissing ?? 0} required missing, ${summary.policy?.risks ?? 0} risk(s))`
  ];
}
