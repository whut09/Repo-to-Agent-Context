import type { Command } from "commander";
import type { EvidencePolicyMode, TaskType } from "../../core/types.js";
import {
  renderOrchestratorReport,
  runHarnessOrchestrator,
  type AgentExecutorName,
  type OrchestratorCheckpointMode
} from "../../harness/control-plane/orchestrator.js";
import type { PolicyFailOn } from "../../harness/verification-plane/policy-engine.js";
import { resolveTaskArguments } from "../task-args.js";
import { parseAgentExecutor, parseEvidencePolicy, parseInteger, parseOrchestratorCheckpoint, parsePolicyFailOn, parseTaskType } from "../parsers/options.js";

export function registerOrchestrateCommands(program: Command): void {
  program
    .command("orchestrate")
    .argument("<args...>", "task description and optional repository path")
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option("--executor <executor>", "executor: codex, claude-code, opencode, mimocode, cursor, mock", parseAgentExecutor, "mock")
    .option("--executor-command <command>", "argv-style command used to run the selected executor; supports {prompt}, {task}, {repo}, {runDir}, {agent}")
    .option("--opencode-transcript <path>", "optional OpenCode session transcript file to normalize into the execution trace")
    .option("--agent <agent>", "executor-specific agent/profile name")
    .option("--max-loops <count>", "maximum orchestrator iterations before requiring human review", parseInteger, 1)
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task context token budget", parseInteger)
    .option("--base <ref>", "base git ref for diff, policy, tests, impact, and verify", "main")
    .option("--fail-on <level>", "policy failure threshold: forbidden, required, risk", parsePolicyFailOn, "required")
    .option("--evidence-policy <mode>", "evidence policy: advisory, balanced, strict", parseEvidencePolicy)
    .option("--checkpoint <mode>", "checkpoint mode: none, git-worktree", parseOrchestratorCheckpoint, "none")
    .option("--dry-run", "exercise the harness using the mock executor without editing files")
    .option("--json", "print machine-readable orchestrator report")
    .description("Harness-led flow: plan/pack -> executor -> diff/trace evidence -> policy/impact/verify -> final decision.")
    .action(async (args: string[], options: OrchestrateCliOptions) => {
      const { task, repo } = resolveTaskArguments(args, options.repo);
      const result = await runHarnessOrchestrator(repo, task, {
        executor: options.executor,
        executorCommand: options.executorCommand,
        opencodeTranscript: options.opencodeTranscript,
        agent: options.agent,
        maxLoops: options.maxLoops,
        type: options.type,
        tokenBudget: options.tokenBudget,
        base: options.base,
        failOn: options.failOn,
        evidencePolicy: options.evidencePolicy,
        checkpoint: options.checkpoint,
        dryRun: options.dryRun
      });
      console.log(options.json ? JSON.stringify(result.report, null, 2) : renderOrchestratorReport(result.report));
      if (result.report.decision.blocking) process.exitCode = 1;
    });

  const agent = program.command("agent").description("Harness-led executor commands for external coding agents.");

  agent
    .command("run")
    .argument("<args...>", "task description and optional repository path")
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option("--executor <executor>", "executor: codex, claude-code, opencode, mimocode, cursor, mock", parseAgentExecutor, "mock")
    .option("--executor-command <command>", "argv-style command used to run the selected executor; supports {prompt}, {task}, {repo}, {runDir}, {agent}")
    .option("--opencode-transcript <path>", "optional OpenCode session transcript file to normalize into the execution trace")
    .option("--agent <agent>", "executor-specific agent/profile name")
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task context token budget", parseInteger)
    .option("--base <ref>", "base git ref for diff, policy, tests, impact, and verify", "main")
    .option("--fail-on <level>", "policy failure threshold: forbidden, required, risk", parsePolicyFailOn, "required")
    .option("--evidence-policy <mode>", "evidence policy: advisory, balanced, strict", parseEvidencePolicy)
    .option("--checkpoint <mode>", "checkpoint mode: none, git-worktree", parseOrchestratorCheckpoint, "none")
    .option("--dry-run", "exercise the harness using the mock executor without editing files")
    .option("--json", "print machine-readable orchestrator report")
    .description("Harness-led alias for one orchestrator pass with a selected coding agent executor.")
    .action(async (args: string[], options: AgentRunCliOptions) => {
      const { task, repo } = resolveTaskArguments(args, options.repo);
      const result = await runHarnessOrchestrator(repo, task, {
        executor: options.executor,
        executorCommand: options.executorCommand,
        opencodeTranscript: options.opencodeTranscript,
        agent: options.agent,
        maxLoops: 1,
        type: options.type,
        tokenBudget: options.tokenBudget,
        base: options.base,
        failOn: options.failOn,
        evidencePolicy: options.evidencePolicy,
        checkpoint: options.checkpoint,
        dryRun: options.dryRun
      });
      console.log(options.json ? JSON.stringify(result.report, null, 2) : renderOrchestratorReport(result.report));
      if (result.report.decision.blocking) process.exitCode = 1;
    });
}

interface OrchestrateCliOptions extends AgentRunCliOptions {
  maxLoops: number;
}

interface AgentRunCliOptions {
  repo?: string | string[];
  executor: AgentExecutorName;
  executorCommand?: string;
  opencodeTranscript?: string;
  agent?: string;
  type: TaskType;
  tokenBudget?: number;
  base: string;
  failOn: PolicyFailOn;
  evidencePolicy?: EvidencePolicyMode;
  checkpoint: OrchestratorCheckpointMode;
  dryRun?: boolean;
  json?: boolean;
}
