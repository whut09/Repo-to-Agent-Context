import type { Command } from "commander";
import { renderOrchestratorReport, runHarnessOrchestrator, type OrchestratorCheckpointMode } from "../../harness/control-plane/orchestrator.js";
import type { PolicyFailOn } from "../../harness/verification-plane/policy-engine.js";
import type { EvidencePolicyMode, TaskType } from "../../core/types.js";
import { resolveTaskArguments } from "../task-args.js";
import {
  findOpencodeReport,
  initOpencodeProject,
  OPENCODE_DEFAULT_EXECUTOR_COMMAND,
  renderOpencodeDoctorReport,
  renderOpencodeInitReport,
  renderOpencodeRepairGuidance,
  renderOpencodeRunSummary,
  runOpencodeDoctor
} from "../opencode-preset.js";
import { parseEvidencePolicy, parseInteger, parseOrchestratorCheckpoint, parsePolicyFailOn, parseTaskType } from "../parsers/options.js";

interface OpencodeRunCliOptions {
  repo?: string | string[];
  executorCommand?: string;
  opencodeTranscript?: string;
  agent?: string;
  maxLoops: number;
  type: TaskType;
  tokenBudget?: number;
  base: string;
  failOn: PolicyFailOn;
  evidencePolicy?: EvidencePolicyMode;
  checkpoint: OrchestratorCheckpointMode;
  dryRun?: boolean;
  json?: boolean;
  fullReport?: boolean;
  streamExecutor?: boolean;
  executorTimeoutMs?: number;
  executorIdleTimeoutMs?: number;
}

interface OpencodeReportCliOptions {
  last?: boolean;
  taskId?: string;
  json?: boolean;
  summary?: boolean;
}

interface OpencodeInitCliOptions {
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

interface OpencodeRepairCliOptions {
  last?: boolean;
  taskId?: string;
}

export function registerOpencodeCommands(program: Command): void {
  const opencode = program.command("opencode").description("OpenCode preset commands.");

  addOpencodeRunOptions(
    opencode
      .command("run")
      .argument("<args...>", "task description and optional repository path")
      .description("Run the harness-led OpenCode preset: plan/pack -> opencode run -> trace/policy/verify -> decision.")
  ).action(async (args: string[], options: OpencodeRunCliOptions) => runOpencodePreset(args, options));

  addOpencodeInitCommand(opencode);
  addOpencodeDoctorCommand(opencode);
  addOpencodeReportCommand(opencode);
  addOpencodeRepairCommand(opencode);

  const oc = program.command("oc").description("Shortcut for OpenCode preset commands.");

  addOpencodeRunOptions(
    oc
      .command("run", { isDefault: true })
      .argument("<args...>", "task description and optional repository path")
      .description("Alias for `opencode-plusplus opencode run`.")
  ).action(async (args: string[], options: OpencodeRunCliOptions) => runOpencodePreset(args, options));

  addOpencodeInitCommand(oc);
  addOpencodeDoctorCommand(oc);
  addOpencodeReportCommand(oc);
  addOpencodeRepairCommand(oc);
}

function addOpencodeRunOptions(command: Command): Command {
  return command
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option(
      "--executor-command <command>",
      "OpenCode command template; supports {prompt}, {task}, {repo}, {runDir}, {agent}",
      OPENCODE_DEFAULT_EXECUTOR_COMMAND
    )
    .option("--opencode-transcript <path>", "optional OpenCode session transcript file to normalize into the execution trace")
    .option("--agent <agent>", "OpenCode agent/profile name")
    .option("--max-loops <count>", "maximum orchestrator iterations before requiring human review", parseInteger, 3)
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task context token budget", parseInteger)
    .option("--base <ref>", "base git ref for diff, policy, tests, impact, and verify", "main")
    .option("--fail-on <level>", "policy failure threshold: forbidden, required, risk", parsePolicyFailOn, "required")
    .option("--evidence-policy <mode>", "evidence policy: advisory, balanced, strict", parseEvidencePolicy)
    .option("--checkpoint <mode>", "checkpoint mode: none, git-worktree", parseOrchestratorCheckpoint, "git-worktree")
    .option("--dry-run", "exercise the harness using the mock executor without editing files")
    .option("--stream-executor", "stream executor stdout/stderr while the harness is running")
    .option("--executor-timeout-ms <ms>", "maximum executor runtime before the harness stops it", parseInteger)
    .option("--executor-idle-timeout-ms <ms>", "maximum executor silence before the harness stops it", parseInteger)
    .option("--full-report", "print the full orchestrator report instead of the compact OpenCode summary")
    .option("--json", "print machine-readable orchestrator report");
}

function addOpencodeInitCommand(parent: Command): void {
  parent
    .command("init")
    .argument("[repo]", "repository path", ".")
    .option("--force", "overwrite existing OpenCode command and agent files")
    .option("--dry-run", "show which OpenCode files would be written without changing files")
    .option("--json", "print machine-readable init report")
    .description("Initialize OpenCode commands and agent files for OpenCode++.")
    .action((repo: string, options: OpencodeInitCliOptions) => {
      const report = initOpencodeProject(repo, { force: options.force, dryRun: options.dryRun });
      console.log(options.json ? JSON.stringify(report, null, 2) : renderOpencodeInitReport(report));
    });
}

function addOpencodeDoctorCommand(parent: Command): void {
  parent
    .command("doctor")
    .argument("[repo]", "repository path", ".")
    .option("--json", "print machine-readable doctor report")
    .description("Check whether OpenCode, plugin version, and the current repository are ready for the OpenCode preset.")
    .action((repo: string, options: { json?: boolean }) => {
      const report = runOpencodeDoctor(repo);
      console.log(options.json ? JSON.stringify(report, null, 2) : renderOpencodeDoctorReport(report));
      if (!report.ok) process.exitCode = 1;
    });
}

function addOpencodeReportCommand(parent: Command): void {
  parent
    .command("report")
    .argument("[repo]", "repository path", ".")
    .option("--last", "show the most recent OpenCode orchestrator report", true)
    .option("--task-id <id>", "show a specific task id")
    .option("--summary", "print the compact OpenCode summary instead of the full report")
    .option("--json", "print machine-readable orchestrator report")
    .description("Show the latest OpenCode orchestrator report without opening .agent-context manually.")
    .action((repo: string, options: OpencodeReportCliOptions) => {
      const result = findOpencodeReport(repo, { last: options.last ?? true, taskId: options.taskId });
      if (!result) {
        console.error("No OpenCode orchestrator report found. Run `opencode-plusplus oc <task>` first.");
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(result.report, null, 2));
      } else if (options.summary) {
        console.log(renderOpencodeRunSummary(result.report));
      } else {
        console.log(renderOrchestratorReport(result.report));
      }
    });
}

function addOpencodeRepairCommand(parent: Command): void {
  parent
    .command("repair")
    .argument("[repo]", "repository path", ".")
    .option("--last", "use the most recent OpenCode orchestrator report", true)
    .option("--task-id <id>", "use a specific task id")
    .description("Print repair guidance from the latest OpenCode decision.")
    .action((repo: string, options: OpencodeRepairCliOptions) => {
      const result = findOpencodeReport(repo, { last: options.last ?? true, taskId: options.taskId });
      if (!result) {
        console.error("No OpenCode orchestrator report found. Run `opencode-plusplus oc <task>` first.");
        process.exitCode = 1;
        return;
      }
      console.log(renderOpencodeRepairGuidance(result.report));
      if (result.report.decision.blocking) process.exitCode = 1;
    });
}

async function runOpencodePreset(args: string[], options: OpencodeRunCliOptions): Promise<void> {
  const { task, repo } = resolveTaskArguments(args, options.repo);
  const result = await runHarnessOrchestrator(repo, task, {
    executor: "opencode",
    executorCommand: options.executorCommand ?? OPENCODE_DEFAULT_EXECUTOR_COMMAND,
    opencodeTranscript: options.opencodeTranscript,
    agent: options.agent,
    maxLoops: options.maxLoops,
    type: options.type,
    tokenBudget: options.tokenBudget,
    base: options.base,
    failOn: options.failOn,
    evidencePolicy: options.evidencePolicy,
    checkpoint: options.checkpoint,
    dryRun: options.dryRun,
    executorTimeoutMs: options.executorTimeoutMs,
    executorIdleTimeoutMs: options.executorIdleTimeoutMs,
    onExecutorOutput:
      options.streamExecutor && !options.json
        ? (event) => {
            const target = event.stream === "stderr" ? process.stderr : process.stdout;
            target.write(event.text);
          }
        : undefined,
    onProgress:
      options.streamExecutor && !options.json
        ? (event) => {
            process.stdout.write(`[OpenCode++ ${event.phase}${event.loop ? `:${event.loop}` : ""}] ${event.message}\n`);
          }
        : undefined
  });
  console.log(
    options.json
      ? JSON.stringify(result.report, null, 2)
      : options.fullReport
        ? renderOrchestratorReport(result.report)
        : renderOpencodeRunSummary(result.report)
  );
  if (result.report.decision.blocking) process.exitCode = 1;
}
