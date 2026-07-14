import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { buildContextPackage, type BuildOptions } from "../core/context-builder.js";
import type { EvidencePolicyMode } from "../core/types.js";
import { buildContextDelta, renderContextDelta } from "../outputs/context-delta.js";
import { buildChangeImpactReport, renderChangeImpactReport } from "../outputs/impact.js";
import { buildLoopControllerReport, renderLoopControllerReport, writeLoopControllerReport, type LoopPhase } from "../harness/control-plane/loop-controller.js";
import { buildPolicyReport, renderPolicyReport, type PolicyFailOn } from "../harness/verification-plane/policy-engine.js";
import { renderTaskPlan, renderTaskVerify, writeTaskContextPack } from "../outputs/task-harness.js";
import { buildTaskPack, renderTaskContext } from "../outputs/task-context.js";
import { buildTestSelection, renderTestSelection } from "../outputs/test-selector.js";
import {
  appendExecutionTraceStep,
  readExecutionTrace,
  renderExecutionTrace,
  type ExecutionFinalState,
  type ExecutionStepResult
} from "../harness/observability/execution-trace.js";
import { writeTaskRun, type TaskRunManifest } from "../outputs/task-run.js";
import { writeContextPackage } from "../outputs/renderers/writer.js";
import { createContextRetriever } from "../retrievers/index.js";
import type { RetrieverProvider } from "../retrievers/types.js";

export const opencodePlusplusMcpToolNames = [
  "opencode_plusplus_build",
  "opencode_plusplus_plan",
  "opencode_plusplus_pack",
  "opencode_plusplus_retrieve",
  "opencode_plusplus_tests",
  "opencode_plusplus_impact",
  "opencode_plusplus_verify",
  "opencode_plusplus_explain",
  "opencode_plusplus_start_loop",
  "opencode_plusplus_step",
  "opencode_plusplus_evaluate",
  "opencode_plusplus_repair",
  "opencode_plusplus_finalize"
] as const;

type OpenCodePlusplusMcpToolName = (typeof opencodePlusplusMcpToolNames)[number];

interface OpenCodePlusplusMcpResult {
  [key: string]: unknown;
}

interface RuntimeGuidance {
  nextAction: OpenCodePlusplusMcpResult;
  blocking: boolean;
  requiredCommands: string[];
  mustInspect: string[];
  allowedEditGlobs: string[];
  avoidEditGlobs: string[];
  missingEvidence: string[];
}

interface RetrieveArguments {
  repo?: string;
  task: string;
  provider?: RetrieverProvider;
  topK?: number;
  modules?: string[];
  changedFiles?: string[];
  includeTests?: boolean;
}

export function createOpenCodePlusplusMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "opencode-plusplus",
      version: "0.1.1"
    },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    "opencode_plusplus_build",
    {
      description: "Scan a repository and write AGENTS.md plus .agent-context outputs.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        target: z.enum(["codex", "claude", "cursor", "all"]).optional().default("codex"),
        tokenBudget: z.number().int().positive().optional(),
        tokenizer: z.enum(["chars_approx", "cl100k_base", "o200k_base"]).optional(),
        model: z.string().optional(),
        llm: z.boolean().optional()
      })
    },
    async (args) => jsonToolResult(await runBuild(args))
  );

  server.registerTool(
    "opencode_plusplus_plan",
    {
      description: "Generate a task plan with suspected modules, must-inspect files, and validation commands.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        task: z.string(),
        type: z.enum(["auto", "bugfix", "feature", "refactor"]).optional().default("auto"),
        tokenBudget: z.number().int().positive().optional()
      })
    },
    async (args) => jsonToolResult(await runTaskPlan(args))
  );

  server.registerTool(
    "opencode_plusplus_pack",
    {
      description: "Write a task context pack under .agent-context/tasks/<task-id>.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        task: z.string(),
        type: z.enum(["auto", "bugfix", "feature", "refactor"]).optional().default("auto"),
        tokenBudget: z.number().int().positive().optional()
      })
    },
    async (args) => jsonToolResult(await runTaskPack(args))
  );

  server.registerTool(
    "opencode_plusplus_retrieve",
    {
      description: "Search repository context through the unified retrieval protocol.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        task: z.string(),
        provider: z.enum(["static", "ripgrep", "hybrid", "lightrag", "embedding"]).optional().default("hybrid"),
        topK: z.number().int().positive().optional().default(8),
        modules: z.array(z.string()).optional(),
        changedFiles: z.array(z.string()).optional(),
        includeTests: z.boolean().optional().default(false)
      })
    },
    async (args) => jsonToolResult(await runRetrieve(args))
  );

  server.registerTool(
    "opencode_plusplus_tests",
    {
      description: "Select minimal, regression, and full-confidence tests for a file, diff, or task.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        forPaths: z.array(z.string()).optional(),
        diff: z.boolean().optional(),
        base: z.string().optional().default("main")
      })
    },
    async (args) => jsonToolResult(await runTests(args))
  );

  server.registerTool(
    "opencode_plusplus_impact",
    {
      description: "Analyze changed files, dependents, related tests, and required verification.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        base: z.string().optional().default("main")
      })
    },
    async (args) => jsonToolResult(await runImpact(args))
  );

  server.registerTool(
    "opencode_plusplus_verify",
    {
      description: "Verify changed files against affected modules, tests, contracts, and risk signals.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        base: z.string().optional().default("main"),
        diff: z.boolean().optional().default(true)
      })
    },
    async (args) => jsonToolResult(await runVerify(args))
  );

  server.registerTool(
    "opencode_plusplus_explain",
    {
      description: "Explain a file or module from the generated repository index.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        targetPath: z.string()
      })
    },
    async (args) => jsonToolResult(await runExplain(args))
  );

  server.registerTool(
    "opencode_plusplus_start_loop",
    {
      description: "Start an agent-native runtime loop: build context, write task run, create execution trace, and return first decisions.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        task: z.string(),
        agent: z.enum(["codex", "claude-code", "cursor", "librechat", "openhands", "other"]).optional().default("other"),
        type: z.enum(["auto", "bugfix", "feature", "refactor"]).optional().default("auto"),
        tokenBudget: z.number().int().positive().optional(),
        base: z.string().optional().default("main"),
        evidencePolicy: z.enum(["advisory", "balanced", "strict"]).optional()
      })
    },
    async (args) => jsonToolResult(await runStartLoop(args))
  );

  server.registerTool(
    "opencode_plusplus_step",
    {
      description: "Append a structured agent runtime step to an execution trace.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        traceId: z.string(),
        agent: z.string().optional(),
        action: z.string(),
        files: z.array(z.string()).optional(),
        reason: z.string().optional(),
        command: z.string().optional(),
        test: z.string().optional(),
        result: z.enum(["passed", "failed", "skipped", "unknown"]).optional(),
        output: z.string().optional(),
        finalState: z.enum(["planned", "in_progress", "partial_success", "success", "failed", "blocked"]).optional()
      })
    },
    async (args) => jsonToolResult(await runRuntimeStep(args))
  );

  server.registerTool(
    "opencode_plusplus_evaluate",
    {
      description: "Evaluate the current agent loop from context delta, loop controller, policy engine, and verify signals.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        task: z.string(),
        traceId: z.string().optional(),
        type: z.enum(["auto", "bugfix", "feature", "refactor"]).optional().default("auto"),
        tokenBudget: z.number().int().positive().optional(),
        base: z.string().optional().default("main"),
        phase: z.enum(["preflight", "after-edit", "repair"]).optional().default("after-edit"),
        failOn: z.enum(["forbidden", "required", "risk"]).optional(),
        strict: z.boolean().optional().default(false),
        evidencePolicy: z.enum(["advisory", "balanced", "strict"]).optional()
      })
    },
    async (args) => jsonToolResult(await runRuntimeEvaluate(args))
  );

  server.registerTool(
    "opencode_plusplus_repair",
    {
      description: "Produce repair-loop decisions and write .agent-context/loops/<task>/loop.* for a failing or risky agent run.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        task: z.string(),
        traceId: z.string().optional(),
        type: z.enum(["auto", "bugfix", "feature", "refactor"]).optional().default("auto"),
        tokenBudget: z.number().int().positive().optional(),
        base: z.string().optional().default("main"),
        evidencePolicy: z.enum(["advisory", "balanced", "strict"]).optional()
      })
    },
    async (args) => jsonToolResult(await runRuntimeRepair(args))
  );

  server.registerTool(
    "opencode_plusplus_finalize",
    {
      description: "Finalize an agent runtime loop with strict policy evaluation and trace final-state update.",
      inputSchema: z.object({
        repo: z.string().optional().default("."),
        task: z.string(),
        traceId: z.string(),
        base: z.string().optional().default("main"),
        evidencePolicy: z.enum(["advisory", "balanced", "strict"]).optional(),
        finalState: z.enum(["success", "partial_success", "failed", "blocked"]).optional().default("success")
      })
    },
    async (args) => jsonToolResult(await runRuntimeFinalize(args))
  );

  return server;
}

export async function runOpenCodePlusplusMcpServer(): Promise<void> {
  const server = createOpenCodePlusplusMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function executeOpenCodePlusplusMcpTool(name: OpenCodePlusplusMcpToolName, args: unknown): Promise<OpenCodePlusplusMcpResult> {
  switch (name) {
    case "opencode_plusplus_build":
      return runBuild(args as BuildInput);
    case "opencode_plusplus_plan":
      return runTaskPlan(args as PlanInput);
    case "opencode_plusplus_pack":
      return runTaskPack(args as PackInput);
    case "opencode_plusplus_retrieve":
      return runRetrieve(args as RetrieveArguments);
    case "opencode_plusplus_tests":
      return runTests(args as TestsInput);
    case "opencode_plusplus_impact":
      return runImpact(args as ImpactInput);
    case "opencode_plusplus_verify":
      return runVerify(args as VerifyInput);
    case "opencode_plusplus_explain":
      return runExplain(args as ExplainInput);
    case "opencode_plusplus_start_loop":
      return runStartLoop(args as RuntimeStartInput);
    case "opencode_plusplus_step":
      return runRuntimeStep(args as RuntimeStepInput);
    case "opencode_plusplus_evaluate":
      return runRuntimeEvaluate(args as RuntimeEvaluateInput);
    case "opencode_plusplus_repair":
      return runRuntimeRepair(args as RuntimeRepairInput);
    case "opencode_plusplus_finalize":
      return runRuntimeFinalize(args as RuntimeFinalizeInput);
  }
}

interface BuildInput extends BuildOptions {
  repo?: string;
}

interface PlanInput {
  repo?: string;
  task: string;
  type?: "auto" | "bugfix" | "feature" | "refactor";
  tokenBudget?: number;
  evidencePolicy?: EvidencePolicyMode;
}

type PackInput = PlanInput;

interface TestsInput {
  repo?: string;
  forPaths?: string[];
  diff?: boolean;
  base?: string;
}

interface ImpactInput {
  repo?: string;
  base?: string;
}

interface VerifyInput {
  repo?: string;
  base?: string;
  diff?: boolean;
}

interface ExplainInput {
  repo?: string;
  targetPath: string;
}

interface RuntimeStartInput extends PlanInput {
  agent?: "codex" | "claude-code" | "cursor" | "librechat" | "openhands" | "other";
  base?: string;
}

interface RuntimeStepInput {
  repo?: string;
  traceId: string;
  agent?: string;
  action: string;
  files?: string[];
  reason?: string;
  command?: string;
  test?: string;
  result?: ExecutionStepResult;
  output?: string;
  finalState?: ExecutionFinalState;
}

interface RuntimeEvaluateInput extends PlanInput {
  traceId?: string;
  base?: string;
  phase?: LoopPhase;
  failOn?: PolicyFailOn;
  strict?: boolean;
}

interface RuntimeRepairInput extends PlanInput {
  traceId?: string;
  base?: string;
}

interface RuntimeFinalizeInput {
  repo?: string;
  task: string;
  traceId: string;
  base?: string;
  evidencePolicy?: EvidencePolicyMode;
  finalState?: Extract<ExecutionFinalState, "success" | "partial_success" | "failed" | "blocked">;
}

async function runBuild(args: BuildInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".", {
    target: args.target,
    tokenBudget: args.tokenBudget,
    llm: args.llm,
    tokenizer: args.tokenizer,
    model: args.model
  });
  const result = writeContextPackage(context);

  return {
    repo: context.scan.root,
    readiness: {
      grade: context.readiness.grade,
      score: context.readiness.score
    },
    tokenSavings: {
      compressionRatio: context.tokenSavings.compressionRatio,
      withinBudget: context.tokenSavings.withinBudget,
      originalTokens: context.tokenSavings.originalRepoTokens.tokens,
      estimatedTokens: context.tokenSavings.estimatedContextPackTokens.tokens,
      actualTokens: context.tokenSavings.actualOutputTokens?.total ?? null
    },
    writtenFiles: result.files.map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/"))
  };
}

async function runTaskPlan(args: PlanInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const markdown = renderTaskPlan(context, args.task, { type: args.type ?? "auto", tokenBudget: args.tokenBudget });
  return {
    task: args.task,
    type: args.type ?? "auto",
    markdown
  };
}

async function runTaskPack(args: PackInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const result = writeTaskContextPack(context, args.task, { type: args.type ?? "auto", tokenBudget: args.tokenBudget });
  return {
    task: args.task,
    taskId: result.taskId,
    dir: path.relative(context.scan.root, result.dir).replaceAll("\\", "/"),
    files: result.files.map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/")),
    markdown: renderTaskContext(context, args.task, { type: args.type ?? "auto", tokenBudget: args.tokenBudget })
  };
}

async function runRetrieve(args: RetrieveArguments): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const retriever = createContextRetriever(context, args.provider ?? "hybrid");
  const hits = await retriever.search(args.task, {
    topK: args.topK ?? 8,
    modules: args.modules,
    changedFiles: args.changedFiles,
    includeTests: args.includeTests ?? false
  });
  const selectionPaths = unique([
    ...(args.changedFiles ?? []),
    ...hits
      .slice(0, 3)
      .map((hit) => hit.path)
      .filter((pathName) => Boolean(pathName))
  ]);
  const selection = buildTestSelection(context, { forPaths: selectionPaths.length ? selectionPaths : undefined, diff: false });

  return {
    task: args.task,
    provider: args.provider ?? "hybrid",
    hits: hits.map((hit) => ({
      path: hit.path,
      reason: hit.title || hit.snippet || "Matches task terms",
      confidence: confidenceForScore(hit.score),
      evidence: [],
      score: Number(hit.score.toFixed(1)),
      moduleName: hit.moduleName,
      kind: hit.kind,
      source: hit.source
    })),
    suggestedCommands: unique([...selection.minimalCommands, ...selection.recommendedCommands]).slice(0, 6)
  };
}

async function runTests(args: TestsInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const report = buildTestSelection(context, {
    forPaths: args.forPaths,
    diff: args.diff,
    base: args.base ?? "main"
  });
  return {
    markdown: renderTestSelection(context, { forPaths: args.forPaths, diff: args.diff, base: args.base ?? "main" }),
    ...report
  };
}

async function runImpact(args: ImpactInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const report = buildChangeImpactReport(context, { base: args.base ?? "main" });
  return {
    markdown: renderChangeImpactReport(context, { base: args.base ?? "main" }),
    report
  };
}

async function runVerify(args: VerifyInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  return {
    markdown: renderTaskVerify(context, { base: args.base ?? "main", diff: args.diff ?? true })
  };
}

async function runExplain(args: ExplainInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const targetPath = args.targetPath.replace(/\\/g, "/");
  const file = context.index.files.find((candidate) => candidate.path === targetPath);
  if (file) {
    return {
      kind: "file",
      path: file.path,
      moduleName: file.moduleName,
      summary: file.summary,
      analyzer: file.analyzer,
      confidence: file.confidence,
      imports: file.imports.map((item) => item.specifier),
      exports: file.exports,
      importanceScore: file.importanceScore,
      importanceReasons: file.importanceReasons
    };
  }

  const module = context.index.modules.find((candidate) => candidate.name === targetPath);
  if (module) {
    return {
      kind: "module",
      name: module.name,
      summary: module.summary,
      files: module.files,
      imports: module.imports
    };
  }

  return {
    kind: "error",
    message: `No file or module found for: ${args.targetPath}`
  };
}

async function runStartLoop(args: RuntimeStartInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const writeResult = writeContextPackage(context);
  const run = writeTaskRun(context, args.task, {
    type: args.type ?? "auto",
    tokenBudget: args.tokenBudget,
    base: args.base ?? "main"
  });
  appendExecutionTraceStep(context.scan.root, run.runId, {
    agent: args.agent ?? "other",
    action: "agent-runtime-start",
    reason: `Started through MCP runtime for ${args.agent ?? "other"}.`,
    finalState: "in_progress"
  });
  const loop = buildLoopControllerReport(context, args.task, {
    phase: "preflight",
    type: args.type ?? "auto",
    tokenBudget: args.tokenBudget,
    base: args.base ?? "main",
    traceId: run.runId,
    evidencePolicy: args.evidencePolicy
  });
  const delta = buildContextDelta(context, { base: args.base ?? "main" });
  const guidance = buildRuntimeGuidance(context, args.task, {
    loop,
    manifest: run.manifest
  });

  return {
    runtime: "agent-native",
    repo: context.scan.root,
    task: args.task,
    runId: run.runId,
    traceId: run.runId,
    taskRunDir: path.relative(context.scan.root, run.dir).replaceAll("\\", "/"),
    traceFile: run.manifest.traceFile,
    generatedFiles: writeResult.files.map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/")),
    loop,
    delta,
    ...guidance
  };
}

async function runRuntimeStep(args: RuntimeStepInput): Promise<OpenCodePlusplusMcpResult> {
  const root = path.resolve(args.repo ?? ".");
  const trace = appendExecutionTraceStep(root, args.traceId, {
    agent: args.agent,
    action: args.action,
    files: args.files,
    reason: args.reason,
    command: args.command,
    test: args.test,
    result: args.result,
    output: args.output,
    finalState: args.finalState
  });
  return {
    traceId: trace.id,
    finalState: trace.finalState,
    steps: trace.steps.length,
    latestStep: trace.steps.at(-1),
    markdown: renderExecutionTrace(trace)
  };
}

async function runRuntimeEvaluate(args: RuntimeEvaluateInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const loop = buildLoopControllerReport(context, args.task, {
    phase: args.phase ?? "after-edit",
    type: args.type ?? "auto",
    tokenBudget: args.tokenBudget,
    base: args.base ?? "main",
    traceId: args.traceId,
    evidencePolicy: args.evidencePolicy
  });
  const policy = buildPolicyReport(context, {
    base: args.base ?? "main",
    traceId: args.traceId,
    failOn: args.failOn,
    strict: args.strict,
    evidencePolicy: args.evidencePolicy ?? (args.strict ? "strict" : undefined)
  });
  const delta = buildContextDelta(context, { base: args.base ?? "main" });
  const verifyMarkdown = renderTaskVerify(context, { base: args.base ?? "main", diff: true });
  const manifest = readTaskRunManifest(context.scan.root, args.traceId ?? taskSlug(args.task));
  const guidance = buildRuntimeGuidance(context, args.task, {
    loop,
    policy,
    manifest,
    type: args.type ?? "auto",
    tokenBudget: args.tokenBudget
  });

  return {
    runtime: "agent-native",
    task: args.task,
    traceId: args.traceId,
    passed: policy.passed && !guidance.blocking,
    loop,
    policy,
    delta,
    ...guidance,
    markdown: [renderLoopControllerReport(loop), "", renderPolicyReport(policy), "", renderContextDelta(delta), "", verifyMarkdown].join("\n")
  };
}

async function runRuntimeRepair(args: RuntimeRepairInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const loopResult = writeLoopControllerReport(context, args.task, {
    phase: "repair",
    type: args.type ?? "auto",
    tokenBudget: args.tokenBudget,
    base: args.base ?? "main",
    traceId: args.traceId,
    evidencePolicy: args.evidencePolicy
  });
  const policy = buildPolicyReport(context, { base: args.base ?? "main", traceId: args.traceId, evidencePolicy: args.evidencePolicy });
  const tests = buildTestSelection(context, { diff: true, base: args.base ?? "main" });
  const manifest = readTaskRunManifest(context.scan.root, args.traceId ?? taskSlug(args.task));
  const guidance = buildRuntimeGuidance(context, args.task, {
    loop: loopResult.report,
    policy,
    manifest,
    type: args.type ?? "auto",
    tokenBudget: args.tokenBudget
  });

  return {
    task: args.task,
    traceId: args.traceId,
    loop: loopResult.report,
    policy,
    repairFiles: loopResult.files.map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/")),
    ...guidance,
    requiredActions: unique([
      ...guidance.requiredCommands,
      ...loopResult.report.decisions.map((decision) => decision.command).filter((command): command is string => Boolean(command)),
      ...policy.findings.map((finding) => finding.requiredAction).filter((command): command is string => Boolean(command)),
      ...tests.fullConfidenceCommands
    ]),
    markdown: [renderLoopControllerReport(loopResult.report), "", renderPolicyReport(policy)].join("\n")
  };
}

async function runRuntimeFinalize(args: RuntimeFinalizeInput): Promise<OpenCodePlusplusMcpResult> {
  const context = await buildContextPackage(args.repo ?? ".");
  const policy = buildPolicyReport(context, { base: args.base ?? "main", traceId: args.traceId, evidencePolicy: args.evidencePolicy });
  const traceBefore = readExecutionTrace(context.scan.root, args.traceId);
  const loop = buildLoopControllerReport(context, args.task, {
    phase: "after-edit",
    base: args.base ?? "main",
    traceId: args.traceId,
    evidencePolicy: args.evidencePolicy
  });
  const manifest = readTaskRunManifest(context.scan.root, args.traceId ?? taskSlug(args.task));
  const guidance = buildRuntimeGuidance(context, args.task, {
    loop,
    policy,
    manifest
  });
  const passed = policy.passed && !guidance.blocking;
  const trace = appendExecutionTraceStep(context.scan.root, args.traceId, {
    action: "finalize",
    reason: passed ? "Runtime policy and loop gates passed; finalizing runtime loop." : "Runtime gates failed; finalizing with unresolved findings.",
    result: passed ? "passed" : "failed",
    finalState: passed ? (args.finalState ?? "success") : "blocked"
  });

  return {
    task: args.task,
    traceId: trace.id,
    previousFinalState: traceBefore?.finalState ?? null,
    finalState: trace.finalState,
    passed,
    loop,
    policy,
    ...guidance,
    markdown: [renderPolicyReport(policy), "", renderExecutionTrace(trace)].join("\n")
  };
}

function buildRuntimeGuidance(
  context: Awaited<ReturnType<typeof buildContextPackage>>,
  task: string,
  input: {
    loop: ReturnType<typeof buildLoopControllerReport>;
    policy?: ReturnType<typeof buildPolicyReport>;
    manifest?: TaskRunManifest;
    type?: PlanInput["type"];
    tokenBudget?: number;
  }
): RuntimeGuidance {
  const fallback = input.manifest ?? fallbackManifest(context, task, input.type, input.tokenBudget);
  const nextAction = firstDecision(input.loop);
  const policyCommands = input.policy?.findings.map((finding) => finding.requiredAction).filter((command): command is string => Boolean(command)) ?? [];
  const missingEvidence = unique([
    ...input.loop.runtime.missingEvidence,
    ...input.loop.decisions.filter((decision) => decision.blocking).map((decision) => decision.reason),
    ...(input.policy?.findings
      .filter((finding) => finding.status === "missing" || finding.status === "failed")
      .map((finding) => `${finding.id}: ${finding.message}`) ?? [])
  ]);

  return {
    nextAction,
    blocking: Boolean(nextAction.blocking) || input.loop.decisions.some((decision) => decision.blocking) || Boolean(input.policy && !input.policy.passed),
    requiredCommands: unique([
      ...fallback.requiredCommands,
      ...input.loop.decisions.map((decision) => decision.command).filter((command): command is string => Boolean(command)),
      ...policyCommands
    ]).filter(isRunnableCommand),
    mustInspect: fallback.mustInspect,
    allowedEditGlobs: fallback.allowedEditGlobs,
    avoidEditGlobs: fallback.avoidEditGlobs,
    missingEvidence
  };
}

function fallbackManifest(
  context: Awaited<ReturnType<typeof buildContextPackage>>,
  task: string,
  type: PlanInput["type"] = "auto",
  tokenBudget?: number
): Pick<TaskRunManifest, "requiredCommands" | "mustInspect" | "allowedEditGlobs" | "avoidEditGlobs"> {
  const pack = buildTaskPack(context, task, { type, tokenBudget });
  const tests = buildTestSelection(context, {
    forPaths: pack.files.filter((file) => file.category === "direct-source" || file.category === "entrypoint").map((file) => file.path)
  });

  return {
    requiredCommands: unique([...pack.suggestedCommands, ...tests.minimalCommands, ...tests.recommendedCommands, ...tests.fullConfidenceCommands]),
    mustInspect: unique([...pack.readFirst.map((file) => file.path), ...pack.files.filter((file) => file.category === "test").map((file) => file.path)]).slice(
      0,
      14
    ),
    allowedEditGlobs: unique(
      pack.files.filter((file) => file.category === "direct-source" || file.category === "entrypoint" || file.category === "test").map((file) => file.path)
    ).slice(0, 24),
    avoidEditGlobs: ["dist/**", "node_modules/**", ".agent-context/**", "**/*.lock", "package-lock.json"]
  };
}

function readTaskRunManifest(root: string, runId: string | undefined): TaskRunManifest | undefined {
  if (!runId) return undefined;
  const filePath = path.join(root, ".agent-context", "runs", runId, "run.json");
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as TaskRunManifest;
  } catch {
    return undefined;
  }
}

function firstDecision(loop: ReturnType<typeof buildLoopControllerReport>): OpenCodePlusplusMcpResult {
  const decision = loop.decisions[0];
  return decision
    ? {
        action: decision.action,
        priority: decision.priority,
        confidence: decision.confidence,
        blocking: decision.blocking,
        reason: decision.reason,
        signals: decision.signals,
        command: decision.command
      }
    : { action: "ready-for-review", confidence: 0.72, blocking: false, signals: ["no loop decisions returned"] };
}

function taskSlug(task: string): string {
  return (
    task
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "task"
  );
}

function confidenceForScore(score: number): "high" | "medium" | "low" {
  if (score >= 40) return "high";
  if (score >= 15) return "medium";
  return "low";
}

function jsonToolResult(result: OpenCodePlusplusMcpResult) {
  return {
    structuredContent: result,
    content: [
      {
        type: "text" as const,
        text: `${JSON.stringify(result, null, 2)}\n`
      }
    ]
  };
}

function isRunnableCommand(command: string): boolean {
  return Boolean(command) && !/^No .*detected/i.test(command);
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOpenCodePlusplusMcpServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
