import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGit } from "../core/git.js";
import { getOpenCodePlusplusPackageVersion } from "../core/package-info.js";
import { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "../integrations/opencode/plugin-runtime/harness/index.js";
import type { PluginHarnessResult } from "../integrations/opencode/plugin-runtime/harness/types.js";
import { createOpenCodePlusPlusSidecar } from "../integrations/opencode/plugin-runtime/index.js";

interface DesktopHarnessTool {
  execute: (args?: unknown) => Promise<string>;
}

export interface DesktopPluginBenchmarkCheck {
  id: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

export interface DesktopPluginBenchmarkResult {
  schemaVersion: 1;
  kind: "deterministic-desktop-plugin";
  version: string;
  paidModelCalls: 0;
  checks: DesktopPluginBenchmarkCheck[];
  selectedFiles: string[];
  totalDurationMs: number;
  passed: boolean;
}

export async function runDesktopPluginBenchmark(): Promise<DesktopPluginBenchmarkResult> {
  const root = createBenchmarkRepository();
  const startedAt = performance.now();
  const checks: DesktopPluginBenchmarkCheck[] = [];
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "plugin-state.json") });
    const tools = plugin.tool as Record<string, DesktopHarnessTool>;
    checks.push(
      timedCheck("tool-registration", 0, () => {
        const actual = Object.keys(tools).sort();
        const expected = [...OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES].sort();
        return [JSON.stringify(actual) === JSON.stringify(expected), `${actual.length} Desktop tools registered`];
      })
    );

    const prepared = await timedTool(checks, "prepare", () =>
      tools.opencode_plusplus_prepare.execute({ task: "fix login timeout regression", type: "bugfix", sessionId: "desktop-benchmark" })
    );
    requireResult(prepared.taskId === "fix-login-timeout-regression", "prepare returned an unexpected taskId");
    requireResult(prepared.blocking && prepared.nextAction === "evaluate", "prepare must require evaluation before completion");

    const retrieved = await timedTool(checks, "retrieve", () =>
      tools.opencode_plusplus_retrieve.execute({ task: "fix login timeout regression", taskType: "bugfix", topK: 4, sessionId: "desktop-benchmark" })
    );
    const selectedFiles = (retrieved.hits ?? []).map((hit) => hit.path);
    const sortedHits = [...(retrieved.hits ?? [])].sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
    requireResult(JSON.stringify(retrieved.hits ?? []) === JSON.stringify(sortedHits), "retrieve results are not deterministically sorted");
    requireResult(
      selectedFiles.some((file) => file.includes("auth")),
      "retrieve did not select an auth implementation or regression test"
    );

    const evaluated = await timedTool(checks, "evaluate", () =>
      tools.opencode_plusplus_evaluate.execute({ taskId: prepared.taskId, sessionId: "desktop-benchmark" })
    );
    requireResult(evaluated.taskId === prepared.taskId, "evaluate did not preserve the prepared taskId");
    requireResult(/^[a-f0-9]{64}$/.test(evaluated.workingTreeHash), "evaluate did not return a working-tree hash");

    const next = await timedTool(checks, "next", () => tools.opencode_plusplus_next.execute({ taskId: prepared.taskId, sessionId: "desktop-benchmark" }));
    requireResult(next.taskId === prepared.taskId, "next did not preserve the prepared taskId");
    requireResult(!next.blocking || next.nextAction !== "finalize", "blocking next result incorrectly finalized");

    return {
      schemaVersion: 1,
      kind: "deterministic-desktop-plugin",
      version: getOpenCodePlusplusPackageVersion(),
      paidModelCalls: 0,
      checks,
      selectedFiles,
      totalDurationMs: roundDuration(performance.now() - startedAt),
      passed: checks.every((check) => check.passed)
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function renderDesktopPluginBenchmark(result: DesktopPluginBenchmarkResult): string {
  return [
    "# Deterministic Desktop Plugin Harness Benchmark",
    "",
    `Version: ${result.version}`,
    `Result: ${result.passed ? "PASS" : "FAIL"}`,
    `Paid model calls: ${result.paidModelCalls}`,
    `Total duration: ${result.totalDurationMs.toFixed(1)} ms`,
    `Selected files: ${result.selectedFiles.join(", ") || "none"}`,
    "",
    "| Check | Result | Duration | Details |",
    "| --- | --- | ---: | --- |",
    ...result.checks.map((check) => `| ${check.id} | ${check.passed ? "PASS" : "FAIL"} | ${check.durationMs.toFixed(1)} ms | ${check.details} |`),
    "",
    "This benchmark invokes the in-process Desktop plugin harness with a local fixture. It does not call a model or external executor."
  ].join("\n");
}

async function timedTool(checks: DesktopPluginBenchmarkCheck[], id: string, execute: () => Promise<string>): Promise<PluginHarnessResult> {
  const startedAt = performance.now();
  const parsed = JSON.parse(await execute()) as PluginHarnessResult;
  const passed = parsed.ok === true;
  checks.push({ id, passed, durationMs: roundDuration(performance.now() - startedAt), details: parsed.summary });
  requireResult(passed, `${id} returned a harness error: ${parsed.error?.message ?? parsed.summary}`);
  return parsed;
}

function timedCheck(id: string, durationMs: number, evaluate: () => [boolean, string]): DesktopPluginBenchmarkCheck {
  const [passed, details] = evaluate();
  requireResult(passed, details);
  return { id, passed, durationMs, details };
}

function requireResult(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Desktop plugin benchmark failed: ${message}`);
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 10) / 10;
}

function createBenchmarkRepository(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-desktop-benchmark-"));
  mkdirSync(path.join(root, "src", "auth"), { recursive: true });
  mkdirSync(path.join(root, "test", "auth"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test", check: "tsc --noEmit" } }), "utf8");
  writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'ok'; }\n", "utf8");
  writeFileSync(
    path.join(root, "src", "auth", "middleware.ts"),
    "import { loginSession } from './session.js';\nexport function authMiddleware() { return loginSession(); }\n",
    "utf8"
  );
  writeFileSync(path.join(root, "test", "auth", "session.test.ts"), "import { loginSession } from '../../src/auth/session.js';\nloginSession();\n", "utf8");
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(root, ["config", "user.name", "OpenCode Plus Plus"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  return root;
}
