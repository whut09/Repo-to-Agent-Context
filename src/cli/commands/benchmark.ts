import type { Command } from "commander";
import { parseAgentBenchmarkModes, renderAgentBehaviorBenchmark, runAgentBehaviorBenchmark } from "../../benchmarks/agent-benchmark.js";
import { renderBenchmarkReport, runBenchmark } from "../../benchmarks/benchmark.js";
import { renderRealAgentBenchmark, runRealAgentBenchmark } from "../../benchmarks/real-agent-benchmark.js";
import type { AgentExecutorName } from "../../harness/control-plane/orchestrator.js";
import type { PolicyFailOn } from "../../harness/verification-plane/policy-engine.js";
import { parseAgentExecutor, parseInteger, parseNonNegativeNumber, parsePolicyFailOn, splitCsv } from "../parsers/options.js";

export function registerBenchmarkCommands(program: Command): void {
  program
    .command("benchmark")
    .argument("[benchmarkDir]", "benchmark directory", "benchmarks")
    .option("-k, --top-k <count>", "top-K files used for recall/precision", parseInteger, 8)
    .option("--json", "print machine-readable benchmark results")
    .description("Run the loop behavior benchmark over benchmark fixtures.")
    .action(async (benchmarkDir: string, options: { topK: number; json?: boolean }) => {
      const result = await runBenchmark({ benchmarkDir, topK: options.topK });
      console.log(options.json ? JSON.stringify(result, null, 2) : renderBenchmarkReport(result));
    });

  program
    .command("benchmark-agent")
    .argument("[benchmarkDir]", "benchmark directory", "benchmarks")
    .option("--executor <executor>", "executor: codex, claude-code, opencode, mimocode, cursor, mock", parseAgentExecutor, "mock")
    .option("--executor-command <command>", "argv-style command; supports {prompt}, {task}, {repo}, {runDir}, {agent}")
    .option("--agent <agent>", "executor-specific agent/profile name")
    .option("--max-loops <count>", "maximum loop count for harness-led mode", parseInteger, 3)
    .option("--fail-on <level>", "policy failure threshold: forbidden, required, risk", parsePolicyFailOn, "required")
    .option("--base <ref>", "base git ref created in each fixture workspace", "main")
    .option("--modes <modes>", "comma-separated modes: no-context, agents-md, context-pack, loop-enabled-harness", parseAgentBenchmarkModes)
    .option("--task <ids>", "comma-separated task ids to run")
    .option("--dry-run", "exercise executor paths without editing files")
    .option("--keep-workdirs", "keep temporary fixture workdirs for inspection")
    .option("--json", "print machine-readable agent behavior benchmark results")
    .description("Run the deterministic agent benchmark proxy or a single executor comparison.")
    .action(async (benchmarkDir: string, options: AgentBenchmarkCliOptions) => {
      const result = await runAgentBehaviorBenchmark({
        benchmarkDir,
        executor: options.executor,
        executorCommand: options.executorCommand,
        agent: options.agent,
        maxLoops: options.maxLoops,
        failOn: options.failOn,
        base: options.base,
        modes: options.modes,
        taskIds: splitCsv(options.task),
        dryRun: options.dryRun,
        keepWorkdirs: options.keepWorkdirs
      });
      console.log(options.json ? JSON.stringify(result, null, 2) : renderAgentBehaviorBenchmark(result));
    });

  program
    .command("benchmark-agent-real")
    .argument("[benchmarkDir]", "benchmark directory", "benchmarks")
    .requiredOption("--executor <executor>", "real executor: codex, claude-code, opencode, mimocode, cursor", parseAgentExecutor)
    .requiredOption("--executor-command <command>", "argv-style command; supports {prompt}, {task}, {repo}, {runDir}, {agent}, {seed}")
    .option("--model <model>", "executor model or profile name")
    .option("--executor-version <version>", "executor CLI or adapter version", "unknown")
    .option("--repetitions <count>", "number of repetitions per selected task and mode", parseInteger, 3)
    .option("--seeds <values>", "comma-separated integer seeds")
    .option("--max-loops <count>", "maximum loop count for harness-led mode", parseInteger, 3)
    .option("--fail-on <level>", "policy failure threshold: forbidden, required, risk", parsePolicyFailOn, "required")
    .option("--base <ref>", "base git ref created in each fixture workspace", "main")
    .option("--modes <modes>", "comma-separated modes: no-context, agents-md, context-pack, loop-enabled-harness", parseAgentBenchmarkModes)
    .option("--task <ids>", "comma-separated task ids to run")
    .option("--output-dir <dir>", "write latest and historical JSON plus Markdown reports", "benchmarks/results/real")
    .option("--baseline <file>", "previous real benchmark JSON used for regression comparison")
    .option("--regression-threshold <number>", "absolute mean regression threshold", parseNonNegativeNumber, 0.05)
    .option("--fail-on-regression", "set a non-zero exit code when a baseline regression is detected")
    .option("--keep-workdirs", "keep temporary fixture workdirs for inspection")
    .option("--json", "print machine-readable real benchmark results")
    .description("Run repeated real-executor benchmarks; intended for manual or scheduled workflows.")
    .action(async (benchmarkDir: string, options: RealAgentBenchmarkCliOptions) => {
      const result = await runRealAgentBenchmark({
        benchmarkDir,
        executor: options.executor,
        executorCommand: options.executorCommand,
        model: options.model,
        executorVersion: options.executorVersion,
        repetitions: options.repetitions,
        seeds: parseSeeds(options.seeds),
        maxLoops: options.maxLoops,
        failOn: options.failOn,
        base: options.base,
        modes: options.modes,
        taskIds: splitCsv(options.task),
        keepWorkdirs: options.keepWorkdirs,
        outputDir: options.outputDir,
        baselinePath: options.baseline,
        regressionThreshold: options.regressionThreshold
      });
      console.log(options.json ? JSON.stringify(result, null, 2) : renderRealAgentBenchmark(result));
      if (options.failOnRegression && result.baseline.status === "regressed") process.exitCode = 1;
    });
}

interface AgentBenchmarkCliOptions {
  executor: AgentExecutorName;
  executorCommand?: string;
  agent?: string;
  maxLoops: number;
  failOn: PolicyFailOn;
  base: string;
  modes?: ReturnType<typeof parseAgentBenchmarkModes>;
  task?: string;
  dryRun?: boolean;
  keepWorkdirs?: boolean;
  json?: boolean;
}

interface RealAgentBenchmarkCliOptions extends Omit<AgentBenchmarkCliOptions, "agent" | "dryRun"> {
  executorCommand: string;
  model?: string;
  executorVersion: string;
  repetitions: number;
  seeds?: string;
  outputDir: string;
  baseline?: string;
  regressionThreshold: number;
  failOnRegression?: boolean;
}

function parseSeeds(value: string | undefined): number[] | undefined {
  const values = splitCsv(value);
  if (!values) return undefined;
  return values.map((item) => {
    const seed = Number.parseInt(item, 10);
    if (!Number.isFinite(seed)) throw new Error(`Expected an integer seed, got: ${item}`);
    return seed;
  });
}
