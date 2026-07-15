import path from "node:path";
import type { Command } from "commander";
import type { EvidencePolicyMode, TaskType } from "../../core/types.js";
import type { CodeIntelligenceBackend } from "../../integrations/codegraph.js";
import { buildContextPackage } from "../../core/context-builder.js";
import { renderChangeImpactReport } from "../../outputs/impact.js";
import { renderTaskContext } from "../../outputs/task-context.js";
import { renderTestSelection } from "../../outputs/test-selector.js";
import { renderTaskVerify } from "../../outputs/task-harness.js";
import {
  buildLoopControllerReport,
  renderLoopControllerReport,
  writeLoopControllerReport,
  type LoopPhase
} from "../../harness/control-plane/loop-controller.js";
import { resolveTaskArguments } from "../task-args.js";
import { parseCodeBackend, parseEvidencePolicy, parseInteger, parseLoopPhase, parseTaskType } from "../parsers/options.js";
import { packApplicationTask, planApplicationTask, startApplicationTask } from "../../application/task-service.js";

export function registerTaskCommands(program: Command): void {
  program
    .command("run")
    .argument("<args...>", "task description and optional repository path")
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task run context token budget", parseInteger)
    .option("--base <ref>", "base git ref for impact and verification reports", "main")
    .description("Agent-led handoff: write .agent-context/runs/<task-id> without spawning a code-agent executor.")
    .action(async (args: string[], options: { repo?: string | string[]; type: TaskType; tokenBudget?: number; base: string }) => {
      const { task, repo } = resolveTaskArguments(args, options.repo);
      const result = await startApplicationTask({ repo, task, type: options.type, tokenBudget: options.tokenBudget, base: options.base });
      const context = result.context;
      console.log(`Wrote task run: ${path.relative(context.scan.root, result.run.dir).replaceAll("\\", "/")}`);
      console.log(`Risk level: ${result.manifest.riskLevel}`);
      console.log(`Context budget: ${result.manifest.contextBudget.usedTokens.toLocaleString()} / ${result.manifest.contextBudget.maxTokens.toLocaleString()}`);
      for (const file of result.run.files) {
        console.log(`- ${path.relative(context.scan.root, file).replaceAll("\\", "/")}`);
      }
    });

  program
    .command("loop")
    .argument("<args...>", "task description and optional repository path")
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option("--phase <phase>", "loop phase: preflight, after-edit, repair", parseLoopPhase, "after-edit")
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task context token budget", parseInteger)
    .option("--base <ref>", "base git ref for diff, tests, impact, and contract checks", "main")
    .option("--trace <id>", "execution trace id used as loop evidence")
    .option("--evidence-policy <mode>", "evidence policy: advisory, balanced, strict", parseEvidencePolicy)
    .option("--write", "write loop.md and loop.json under .agent-context/loops/<task-id>")
    .option("--json", "print machine-readable loop controller report")
    .description("Decide the next agent-loop step from context freshness, diff, contracts, tests, and impact signals.")
    .action(
      async (
        args: string[],
        options: {
          repo?: string | string[];
          phase: LoopPhase;
          type: TaskType;
          tokenBudget?: number;
          base: string;
          trace?: string;
          evidencePolicy?: EvidencePolicyMode;
          write?: boolean;
          json?: boolean;
        }
      ) => {
        const { task, repo } = resolveTaskArguments(args, options.repo);
        const context = await buildContextPackage(repo);
        const loopOptions = {
          phase: options.phase,
          type: options.type,
          tokenBudget: options.tokenBudget,
          base: options.base,
          traceId: options.trace,
          evidencePolicy: options.evidencePolicy
        };
        const report = buildLoopControllerReport(context, task, loopOptions);
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(renderLoopControllerReport(report));
        }
        if (options.write) {
          const result = writeLoopControllerReport(context, task, loopOptions);
          console.log("");
          console.log(`Wrote loop report: ${path.relative(context.scan.root, result.dir).replaceAll("\\", "/")}`);
          for (const file of result.files) console.log(`- ${path.relative(context.scan.root, file).replaceAll("\\", "/")}`);
        }
        if (report.status === "needs-repair" || report.status === "blocked") process.exitCode = 1;
      }
    );

  program
    .command("plan")
    .argument("<args...>", "task description and optional repository path")
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task planning token budget", parseInteger)
    .description("Generate a task plan with inspection, risk, and validation guidance.")
    .action(async (args: string[], options: { repo?: string | string[]; type: TaskType; tokenBudget?: number }) => {
      const { task, repo } = resolveTaskArguments(args, options.repo);
      const result = await planApplicationTask({ repo, task, type: options.type, tokenBudget: options.tokenBudget });
      console.log(result.markdown);
    });

  program
    .command("pack")
    .argument("<args...>", "task description and optional repository path")
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task context token budget", parseInteger)
    .description("Write a task context pack under .agent-context/tasks/<task-id>.")
    .action(async (args: string[], options: { repo?: string | string[]; type: TaskType; tokenBudget?: number }) => {
      const { task, repo } = resolveTaskArguments(args, options.repo);
      const result = await packApplicationTask({ repo, task, type: options.type, tokenBudget: options.tokenBudget });
      console.log(`Wrote task pack: ${result.dir}`);
      for (const file of result.files) console.log(`- ${file}`);
    });

  program
    .command("verify")
    .argument("[repo]", "repository path", ".")
    .option("--diff", "verify changed files from git diff and working tree", true)
    .option("--base <ref>", "base git ref", "main")
    .option("--trace <id>", "execution trace id used as regression test evidence")
    .description("Verify changed files against affected modules, tests, and risk signals.")
    .action(async (repo: string, options: { diff?: boolean; base: string; trace?: string }) => {
      const context = await buildContextPackage(repo);
      console.log(renderTaskVerify(context, { base: options.base, diff: options.diff, traceId: options.trace }));
    });

  program
    .command("task")
    .argument("<args...>", "task description and optional repository path")
    .option("--repo <repo...>", "repository path; accepts multiple words when the path contains spaces or non-ASCII characters")
    .option("--type <type>", "task type: auto, bugfix, feature, refactor", parseTaskType, "auto")
    .option("-b, --token-budget <tokens>", "task context token budget", parseInteger)
    .description("Generate a task-focused context recommendation.")
    .action(async (args: string[], options: { repo?: string | string[]; type: TaskType; tokenBudget?: number }) => {
      const { task, repo } = resolveTaskArguments(args, options.repo);
      const context = await buildContextPackage(repo);
      console.log(renderTaskContext(context, task, { type: options.type, tokenBudget: options.tokenBudget }));
    });

  program
    .command("tests")
    .argument("[repo]", "repository path", ".")
    .option("--for <path...>", "select tests for one or more changed source files")
    .option("--diff", "select tests for files changed from the base ref")
    .option("--base <ref>", "base git ref for --diff", "main")
    .option("--backend <backend>", "code intelligence backend: internal, codegraph", parseCodeBackend, "internal")
    .description("Select minimal, regression, and full-confidence tests for a file or diff.")
    .action(async (repo: string, options: { for?: string[]; diff?: boolean; base: string; backend: CodeIntelligenceBackend }) => {
      const context = await buildContextPackage(repo);
      console.log(renderTestSelection(context, { forPaths: options.for, diff: options.diff, base: options.base, backend: options.backend }));
    });

  program
    .command("impact")
    .argument("[repo]", "repository path", ".")
    .option("--base <ref>", "base git ref", "main")
    .option("--backend <backend>", "code intelligence backend: internal, codegraph", parseCodeBackend, "internal")
    .description("Analyze changed files, dependents, related tests, and required verification.")
    .action(async (repo: string, options: { base: string; backend: CodeIntelligenceBackend }) => {
      const context = await buildContextPackage(repo);
      console.log(renderChangeImpactReport(context, { base: options.base, backend: options.backend }));
    });
}
