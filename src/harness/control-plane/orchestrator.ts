import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ContextPackage, EvidencePolicyMode, TaskType } from "../../core/types.js";
import { buildContextPackage } from "../../core/context-builder.js";
import { changedFilesSince, runGit } from "../../core/git.js";
import { shellQuote } from "../../core/safe-command.js";
import { GitWorktreeSandboxAdapter } from "../../sandbox/git-worktree-sandbox.js";
import { HostSandboxAdapter } from "../../sandbox/host-sandbox.js";
import type { ExecResult, SandboxAdapter, SandboxHandle } from "../../sandbox/sandbox-adapter.js";
import { normalizeAgentEvents, type AgentEvent } from "../../outputs/agent-events.js";
import { writeContextPackage } from "../../outputs/renderers/writer.js";
import {
  buildHallucinationReport,
  renderHallucinationReport,
  writeHallucinationReport,
  type HallucinationGuardReport
} from "../verification-plane/guards/hallucination.js";
import { renderChangeImpactReport } from "../../outputs/impact.js";
import { buildRegressionReport, renderRegressionReport, writeRegressionReport, type RegressionGuardReport } from "../verification-plane/guards/regression.js";
import { writeFinalizeMemoryCandidate } from "../verification-plane/guards/regression-memory.js";
import { buildLoopControllerReport, renderLoopControllerReport, type LoopControllerReport } from "./loop-controller.js";
import { buildPolicyReport, renderPolicyReport, type PolicyFailOn, type PolicyEngineReport } from "../verification-plane/policy-engine.js";
import { renderTaskVerify } from "../../outputs/task-harness.js";
import { writeTaskRun, type TaskRunWriteResult } from "../../outputs/task-run.js";
import { appendExecutionTraceStep, currentWorkingTreeHash, readExecutionTrace } from "../observability/execution-trace.js";
import { buildGuardFindingsArtifact, type GuardFindingsArtifact } from "../../outputs/guard-finding.js";
import { buildGuardGateReport, type GuardGateReport } from "../../outputs/guard-gates.js";
import { bullet, code, heading, table } from "../../outputs/renderers/markdown.js";
import type { HarnessDecision, HarnessDecisionAction } from "../types.js";
import { decideHarnessAction, HARNESS_DECISION_PRIORITY, maxLoopHarnessDecision, noProgressHarnessDecision } from "./decision-engine.js";
import { buildIterationStateFingerprint, evaluateConvergence, type ConvergenceResult, type IterationStateFingerprint } from "./convergence.js";

export type AgentExecutorName = "codex" | "claude-code" | "opencode" | "mimocode" | "cursor" | "mock";
export type OrchestratorDecision = HarnessDecisionAction;
export type OrchestratorCheckpointMode = "none" | "git-worktree";

export const ORCHESTRATOR_DECISION_PRIORITY = HARNESS_DECISION_PRIORITY;

export interface HarnessOrchestratorOptions {
  executor?: AgentExecutorName;
  executorCommand?: string;
  agent?: string;
  maxLoops?: number;
  failOn?: PolicyFailOn;
  evidencePolicy?: EvidencePolicyMode;
  type?: TaskType;
  tokenBudget?: number;
  base?: string;
  dryRun?: boolean;
  checkpoint?: OrchestratorCheckpointMode;
  opencodeTranscript?: string;
  executorTimeoutMs?: number;
  executorIdleTimeoutMs?: number;
  onExecutorOutput?: (event: { stream: "stdout" | "stderr"; text: string }) => void;
  onProgress?: (event: HarnessProgressEvent) => void;
}

export interface HarnessProgressEvent {
  at: string;
  phase: "context" | "plan" | "sandbox" | "execute" | "collect" | "evaluate" | "decision" | "write";
  message: string;
  loop?: number;
}

export interface AgentExecutorInput {
  repo: string;
  hostRepo: string;
  task: string;
  prompt: string;
  runDir: string;
  runId: string;
  base: string;
  sandbox: SandboxAdapter;
  sandboxHandle: SandboxHandle;
  agent?: string;
  executorCommand?: string;
  dryRun?: boolean;
  executorTimeoutMs?: number;
  executorIdleTimeoutMs?: number;
  onExecutorOutput?: (event: { stream: "stdout" | "stderr"; text: string }) => void;
  onProgress?: (event: HarnessProgressEvent) => void;
}

export interface AgentExecutorResult {
  executor: AgentExecutorName;
  exitCode: number | null;
  command?: string;
  eventsPath?: string;
  stdout: string;
  stderr: string;
  changedFiles: string[];
  diffPath?: string;
  startedAt?: string;
  finishedAt?: string;
  stdoutHash?: string;
  stderrHash?: string;
  workingTreeHashBefore?: string;
  workingTreeHashAfter?: string;
  normalizedEventsPath?: string;
  normalizedEventsCount?: number;
  normalizerSource?: string;
  sandboxMode?: SandboxHandle["mode"];
  sandboxRoot?: string;
}

export interface HarnessOrchestratorReport {
  task: string;
  taskId: string;
  repo: string;
  base: string;
  executor: AgentExecutorName;
  runDir: string;
  traceId: string;
  maxLoops: number;
  dryRun: boolean;
  phases: Array<"plan" | "pack" | "execute" | "collect" | "evaluate" | "decision">;
  executorResult: AgentExecutorResult;
  changedFiles: string[];
  iterations: OrchestratorIterationReport[];
  policy: Pick<PolicyEngineReport, "passed" | "failOn" | "summary">;
  loop: Pick<LoopControllerReport, "status" | "risk" | "trace" | "checks" | "decisions">;
  gates: Pick<GuardGateReport, "summary" | "gates">;
  decision: HarnessDecision;
  convergence: ConvergenceResult;
  artifacts: {
    contextFiles: string[];
    runFiles: string[];
    orchestratorFiles: string[];
    iterationFiles: string[];
    checkpointFile?: string;
    diffFile?: string;
    sandboxGatewayManifest?: string;
    sandboxPatchFile?: string;
    memoryCandidateFile?: string;
  };
  sandbox: {
    mode: SandboxHandle["mode"];
    root: string;
    discarded: boolean;
    initialPatch: boolean;
    gatewayDir?: string;
    manifestPath?: string;
    patchPath?: string;
    applyCommand?: string;
  };
}

export interface OrchestratorIterationReport {
  index: number;
  dir: string;
  promptFile: string;
  executorResult: AgentExecutorResult;
  changedFiles: string[];
  policy: Pick<PolicyEngineReport, "passed" | "failOn" | "summary">;
  loop: Pick<LoopControllerReport, "status" | "risk" | "trace" | "checks" | "decisions">;
  gates: Pick<GuardGateReport, "summary" | "gates">;
  decision: HarnessOrchestratorReport["decision"];
  convergence: ConvergenceResult;
  files: string[];
}

export interface HarnessOrchestratorWriteResult {
  report: HarnessOrchestratorReport;
  files: string[];
}

type AgentExecutor = (input: AgentExecutorInput) => Promise<AgentExecutorResult>;

interface IterationArtifactInput {
  runId: string;
  iteration: number;
  promptFile: string;
  executorResult: AgentExecutorResult;
  agentEvents: AgentEvent[];
  hallucination: HallucinationGuardReport;
  regression: RegressionGuardReport;
  policy: PolicyEngineReport;
  verify: string;
  loop: LoopControllerReport;
  decision: HarnessOrchestratorReport["decision"];
  convergence: ConvergenceResult;
  guardFindings: GuardFindingsArtifact;
  guardGates: GuardGateReport;
}

export async function runHarnessOrchestrator(repo: string, task: string, options: HarnessOrchestratorOptions = {}): Promise<HarnessOrchestratorWriteResult> {
  const base = options.base ?? "main";
  const executorName = options.executor ?? "mock";
  const maxLoops = Math.max(1, options.maxLoops ?? 1);
  const root = path.resolve(repo);
  const progress = (phase: HarnessProgressEvent["phase"], message: string, loop?: number) => {
    options.onProgress?.({ at: new Date().toISOString(), phase, message, loop });
  };

  progress("context", `building repository context for ${root}`);
  const preContext = await buildContextPackage(root);
  progress("context", "writing context package");
  const contextWrite = writeContextPackage(preContext);
  const executor = createAgentExecutor(executorName);
  progress("plan", "writing task run and edit boundary");
  const taskRun = writeTaskRun(preContext, task, { base, type: options.type ?? "auto", tokenBudget: options.tokenBudget, preserveTrace: true });
  const dir = path.join(root, ".agent-context", "orchestrator", taskRun.runId);
  mkdirSync(dir, { recursive: true });
  const checkpoint = createCheckpoint(root, taskRun.runId, taskRun.dir, options.checkpoint ?? "none");
  const sandbox = createSandboxAdapter(options.checkpoint ?? "none");
  progress("sandbox", `preparing ${options.checkpoint ?? "none"} sandbox`);
  const sandboxHandle = await sandbox.prepare(taskRun.runId, root);
  let sandboxDiscarded = sandboxHandle.mode === "host";
  const iterations: OrchestratorIterationReport[] = [];
  let previousDecision: HarnessOrchestratorReport["decision"] | undefined;
  let latestContext = preContext;
  if (sandboxHandle.mode === "git-worktree") {
    progress("context", "building context inside git-worktree sandbox");
    latestContext = await buildContextPackage(sandboxHandle.root);
    writeContextPackage(latestContext);
    writeTaskRun(latestContext, task, { base, type: options.type ?? "auto", tokenBudget: options.tokenBudget, preserveTrace: true });
    mirrorTraceForEvaluation(root, sandboxHandle.root, taskRun.runId);
  }
  let latestExecutorResult: AgentExecutorResult | undefined;
  let latestPolicy: PolicyEngineReport | undefined;
  let latestLoop: LoopControllerReport | undefined;
  let latestGuardGates: GuardGateReport | undefined;
  let latestChangedFiles: string[] = [];
  let latestDecision: HarnessOrchestratorReport["decision"] | undefined;
  let latestConvergence: ConvergenceResult | undefined;
  let previousFingerprint: IterationStateFingerprint | undefined;

  try {
    for (let loopIndex = 1; loopIndex <= maxLoops; loopIndex += 1) {
      progress("plan", `starting loop ${loopIndex} of ${maxLoops}`, loopIndex);
      if (loopIndex > 1 || previousDecision?.action === "repack") {
        progress("context", "refreshing context for next loop", loopIndex);
        latestContext = await buildContextPackage(sandboxHandle.root);
        writeContextPackage(latestContext);
        writeTaskRun(latestContext, task, { base, type: options.type ?? "auto", tokenBudget: options.tokenBudget, preserveTrace: true });
        mirrorTraceForEvaluation(root, sandboxHandle.root, taskRun.runId);
      }

      const iterationDir = path.join(taskRun.dir, "iterations", String(loopIndex).padStart(3, "0"));
      mkdirSync(iterationDir, { recursive: true });
      const prompt = buildExecutorPrompt(latestContext, taskRun, executorName, options, previousDecision, loopIndex);
      const promptFile = write(path.join(iterationDir, "prompt.md"), prompt);
      progress("execute", `launching ${executorName} executor`, loopIndex);
      const executorResult = await executor({
        repo: sandboxHandle.root,
        hostRepo: root,
        task,
        prompt,
        runDir: iterationDir,
        runId: taskRun.runId,
        base,
        sandbox,
        sandboxHandle,
        agent: options.agent,
        executorCommand: options.executorCommand,
        dryRun: options.dryRun,
        executorTimeoutMs: options.executorTimeoutMs,
        executorIdleTimeoutMs: options.executorIdleTimeoutMs,
        onExecutorOutput: options.onExecutorOutput,
        onProgress: options.onProgress
      });
      progress("collect", `${executorName} executor finished with exit code ${executorResult.exitCode ?? "unknown"}`, loopIndex);

      progress("collect", "normalizing executor events", loopIndex);
      const normalized = normalizeAgentEvents({
        executor: executorName,
        stdout: executorResult.stdout,
        stderr: executorResult.stderr,
        repo: sandboxHandle.root,
        transcriptPath: options.opencodeTranscript,
        startedAt: executorResult.startedAt,
        finishedAt: executorResult.finishedAt,
        exitCode: executorResult.exitCode
      });
      const normalizedEventsPath = writeAgentEvents(iterationDir, normalized.events);
      executorResult.normalizedEventsPath = path.relative(root, normalizedEventsPath).replaceAll("\\", "/");
      executorResult.normalizedEventsCount = normalized.events.length;
      executorResult.normalizerSource = normalized.source;

      appendAgentEventsToTrace(root, taskRun.runId, executorName, normalized.events);
      appendExecutorTrace(root, taskRun.runId, executorName, executorResult, loopIndex, normalized.warnings);
      mirrorTraceForEvaluation(root, sandboxHandle.root, taskRun.runId);

      progress("evaluate", "running hallucination, regression, impact, policy, and verify checks", loopIndex);
      const postContext = await buildContextPackage(sandboxHandle.root);
      const evidencePolicy = options.evidencePolicy ?? postContext.config.evidencePolicy;
      const hallucination = buildHallucinationReport(postContext, { base, traceId: taskRun.runId, task });
      writeHallucinationReport(postContext, hallucination);
      const regression = buildRegressionReport(postContext, { base, traceId: taskRun.runId, task, evidencePolicy });
      writeRegressionReport(postContext, regression);
      const changedFiles = collectChangedFiles(sandboxHandle.root, base);
      const policy = buildPolicyReport(postContext, {
        base,
        traceId: taskRun.runId,
        failOn: options.failOn ?? "required",
        evidencePolicy
      });
      const verify = renderTaskVerify(postContext, { base, diff: true });
      const loop = buildLoopControllerReport(postContext, task, {
        phase: loopIndex === 1 ? "after-edit" : previousDecision?.action === "repair" ? "repair" : "after-edit",
        base,
        type: options.type ?? "auto",
        tokenBudget: options.tokenBudget,
        traceId: taskRun.runId,
        evidencePolicy
      });
      const guardFindings = buildGuardFindingsArtifact({
        runId: taskRun.runId,
        iteration: loopIndex,
        policy,
        hallucination,
        regression
      });
      const trace = readExecutionTrace(root, taskRun.runId);
      const guardGates = buildGuardGateReport({
        runId: taskRun.runId,
        iteration: loopIndex,
        policy,
        loop,
        guardFindings,
        trace,
        changedFiles,
        checkpointMode: options.checkpoint ?? "none"
      });
      const decision = decideHarnessAction({
        executorResult,
        changedFiles,
        policy,
        loop,
        guardGates,
        checkpointMode: options.checkpoint ?? "none"
      });
      const fingerprint = buildIterationStateFingerprint({
        workingTreeHash: currentWorkingTreeHash(sandboxHandle.root),
        decisionAction: decision.action,
        blockingFindingIds: guardFindings.findings
          .filter((finding) => finding.status === "failed" || finding.status === "missing")
          .map((finding) => finding.id),
        blockingGateIds: guardGates.gates.filter((gate) => gate.status === "blocked").map((gate) => gate.id),
        missingEvidence: loop.runtime.missingEvidence,
        requiredCommands: decision.requiredCommands,
        contextFreshness: loop.context.freshness,
        contextDrift: loop.context.drift
      });
      const convergence = evaluateConvergence({
        fingerprint,
        previousFingerprint,
        decision,
        executorExitCode: executorResult.exitCode,
        loopIndex,
        maxLoops
      });
      if (convergence.status === "repeated-state") {
        latestDecision = noProgressHarnessDecision(fingerprint.value, decision);
      } else if (convergence.status === "max-loops-reached") {
        latestDecision = maxLoopHarnessDecision(maxLoops, decision);
      } else {
        latestDecision = decision;
      }
      latestConvergence = convergence;
      progress("decision", `decision: ${latestDecision.action}`, loopIndex);

      const iterationFiles = writeIterationArtifacts(root, iterationDir, {
        runId: taskRun.runId,
        iteration: loopIndex,
        promptFile,
        executorResult,
        agentEvents: normalized.events,
        hallucination,
        regression,
        policy,
        verify,
        loop,
        decision: latestDecision,
        convergence,
        guardFindings,
        guardGates
      });
      const iterationReport: OrchestratorIterationReport = {
        index: loopIndex,
        dir: path.relative(root, iterationDir).replaceAll("\\", "/"),
        promptFile: path.relative(root, promptFile).replaceAll("\\", "/"),
        executorResult,
        changedFiles,
        policy: {
          passed: policy.passed,
          failOn: policy.failOn,
          summary: policy.summary
        },
        loop: {
          status: loop.status,
          risk: loop.risk,
          trace: loop.trace,
          checks: loop.checks,
          decisions: loop.decisions
        },
        gates: {
          summary: guardGates.summary,
          gates: guardGates.gates
        },
        decision: latestDecision,
        convergence,
        files: iterationFiles.map((file) => path.relative(root, file).replaceAll("\\", "/"))
      };
      iterations.push(iterationReport);

      latestContext = postContext;
      latestExecutorResult = executorResult;
      latestPolicy = policy;
      latestLoop = loop;
      latestGuardGates = guardGates;
      latestChangedFiles = changedFiles;
      previousDecision = latestDecision;
      previousFingerprint = fingerprint;

      if (convergence.shouldStop) break;
    }

    if (!latestExecutorResult || !latestPolicy || !latestLoop || !latestGuardGates || !latestDecision || !latestConvergence) {
      throw new Error("Orchestrator loop did not produce an iteration.");
    }

    const report: HarnessOrchestratorReport = {
      task,
      taskId: taskRun.runId,
      repo: root,
      base,
      executor: executorName,
      runDir: path.relative(root, taskRun.dir).replaceAll("\\", "/"),
      traceId: taskRun.runId,
      maxLoops,
      dryRun: Boolean(options.dryRun),
      phases: ["plan", "pack", "execute", "collect", "evaluate", "decision"],
      executorResult: latestExecutorResult,
      changedFiles: latestChangedFiles,
      iterations,
      policy: {
        passed: latestPolicy.passed,
        failOn: latestPolicy.failOn,
        summary: latestPolicy.summary
      },
      loop: {
        status: latestLoop.status,
        risk: latestLoop.risk,
        trace: latestLoop.trace,
        checks: latestLoop.checks,
        decisions: latestLoop.decisions
      },
      gates: {
        summary: latestGuardGates.summary,
        gates: latestGuardGates.gates
      },
      decision: latestDecision,
      convergence: latestConvergence,
      artifacts: {
        contextFiles: contextWrite.files.map((file) => path.relative(root, file).replaceAll("\\", "/")),
        runFiles: taskRun.files.map((file) => path.relative(root, file).replaceAll("\\", "/")),
        orchestratorFiles: [],
        iterationFiles: iterations.flatMap((iteration) => iteration.files),
        checkpointFile: checkpoint?.relativePath,
        diffFile: latestExecutorResult.diffPath,
        sandboxGatewayManifest: relativeOptional(root, sandboxHandle.manifestPath),
        sandboxPatchFile: relativeOptional(root, sandboxHandle.patchPath)
      },
      sandbox: {
        mode: sandboxHandle.mode,
        root: sandboxHandle.root,
        discarded: sandboxDiscarded,
        initialPatch: Boolean(sandboxHandle.initialPatch),
        gatewayDir: relativeOptional(root, sandboxHandle.gatewayDir),
        manifestPath: relativeOptional(root, sandboxHandle.manifestPath),
        patchPath: relativeOptional(root, sandboxHandle.patchPath),
        applyCommand: sandboxHandle.applyCommand
      }
    };

    const impactMd = renderChangeImpactReport(latestContext, { base });
    const verifyMd = renderTaskVerify(latestContext, { base, diff: true });
    const loopMd = renderLoopControllerReport(latestLoop);
    const memoryCandidate =
      latestDecision.action === "finalize" ? writeFinalizeMemoryCandidate(latestContext, task, base, latestChangedFiles, root) : undefined;
    report.artifacts.memoryCandidateFile = memoryCandidate?.file;
    if (sandboxHandle.mode === "git-worktree") {
      await sandbox.discard();
      sandboxDiscarded = true;
      report.sandbox.discarded = true;
    }

    const files = [
      write(path.join(dir, "orchestrator.md"), renderOrchestratorReport(report)),
      write(path.join(dir, "orchestrator.json"), JSON.stringify(report, null, 2)),
      write(path.join(dir, "policy.md"), renderPolicyReport(latestPolicy)),
      write(path.join(dir, "impact.md"), impactMd),
      write(path.join(dir, "verify.md"), verifyMd),
      write(path.join(dir, "loop.md"), loopMd)
    ];
    report.artifacts.orchestratorFiles = files.map((file) => path.relative(root, file).replaceAll("\\", "/"));
    writeFileSync(path.join(dir, "orchestrator.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    progress("write", `wrote orchestrator report to ${path.relative(root, path.join(dir, "orchestrator.md")).replaceAll("\\", "/")}`);

    return { report, files };
  } finally {
    if (sandboxHandle.mode === "git-worktree" && !sandboxDiscarded) {
      await sandbox.discard();
    }
  }
}

function relativeOptional(root: string, filePath: string | undefined): string | undefined {
  return filePath ? path.relative(root, filePath).replaceAll("\\", "/") : undefined;
}

function decisionReason(decision: HarnessDecision): string {
  return decision.reasons[0] ?? decision.action;
}

function decisionPriority(decision: HarnessDecision): number {
  return ORCHESTRATOR_DECISION_PRIORITY[decision.action];
}

export function renderOrchestratorReport(report: HarnessOrchestratorReport): string {
  return [
    heading(1, "Harness Orchestrator"),
    "",
    `Task: ${report.task}`,
    `Task id: ${report.taskId}`,
    `Executor: ${report.executor}`,
    `Decision: ${report.decision.action}`,
    `Convergence: ${report.convergence.status}`,
    `Base: ${report.base}`,
    `Sandbox: ${report.sandbox.mode}${report.sandbox.discarded ? " (discarded)" : ""}`,
    "",
    heading(2, "Architecture Flow"),
    bullet(
      [
        "OpenCode++ plan / pack",
        `Executor: ${report.executor}`,
        "Agent execution",
        "Diff / trace / test evidence collection",
        "Policy / contracts / tests / impact / verify evaluation",
        `Decision: ${report.decision.action}`
      ].map((item) => item)
    ),
    "",
    heading(2, "Evidence Summary"),
    table(
      ["Question", "Answer"],
      [
        ["Which agent executed?", report.executor],
        ["Which files changed?", report.changedFiles.length ? report.changedFiles.map(code).join(", ") : "none"],
        ["Which executor command ran?", report.executorResult.command ? code(report.executorResult.command) : "none"],
        ["Where did the executor run?", report.sandbox.mode === "git-worktree" ? code(report.sandbox.root) : "host repository"],
        ["Normalized executor events", String(report.executorResult.normalizedEventsCount ?? 0)],
        ["Trusted test evidence", report.loop.trace.passedTestEvidence],
        ["Trace loaded", report.loop.trace.loaded ? "yes" : "no"],
        [
          "Boundary / contract check",
          `${report.loop.checks.contracts} (${report.loop.checks.contractViolations} violation${report.loop.checks.contractViolations === 1 ? "" : "s"})`
        ],
        ["Policy gate", report.policy.passed ? "passed" : "failed"],
        ["Blocking Guard gates", String(report.gates.summary.blocking)],
        ["Missing required evidence", String(report.policy.summary.requiredMissing)],
        ["Forbidden findings", String(report.policy.summary.forbidden)],
        ["Impact risk", report.loop.risk],
        ["Convergence", report.convergence.status],
        ["State fingerprint", code(report.convergence.fingerprint.value)],
        ["Selected decision candidate", report.decision.arbitration?.selectedCandidate.id ?? "legacy/direct decision"],
        ["Final decision", `${report.decision.action} - ${decisionReason(report.decision)}`]
      ]
    ),
    "",
    heading(2, "Guard Gates"),
    table(
      ["Guard", "Condition", "Status", "Action"],
      report.gates.gates.map((gate) => [gate.guard, gate.condition, gate.status, gate.action])
    ),
    "",
    heading(2, "Sandbox"),
    table(
      ["Field", "Value"],
      [
        ["Mode", report.sandbox.mode],
        ["Root", code(report.sandbox.root)],
        ["Initial source patch applied", report.sandbox.initialPatch ? "yes" : "no"],
        ["Discarded after export", report.sandbox.discarded ? "yes" : "no"],
        ["Gateway", report.sandbox.gatewayDir ? code(report.sandbox.gatewayDir) : "none"],
        ["Gateway manifest", report.sandbox.manifestPath ? code(report.sandbox.manifestPath) : "none"],
        ["Patch", report.sandbox.patchPath ? code(report.sandbox.patchPath) : "none"],
        ["Apply command", report.sandbox.applyCommand ? code(report.sandbox.applyCommand) : "none"]
      ]
    ),
    "",
    heading(2, "Decision"),
    table(
      ["Field", "Value"],
      [
        ["Action", report.decision.action],
        ["Priority", String(decisionPriority(report.decision))],
        ["Blocking", report.decision.blocking ? "yes" : "no"],
        ["Confidence", report.decision.confidence.toFixed(2)],
        ["Reason", decisionReason(report.decision).replace(/\|/g, "\\|")],
        ["Required commands", report.decision.requiredCommands.length ? report.decision.requiredCommands.map(code).join(", ") : "none"]
      ]
    ),
    "",
    heading(2, "Decision Reasons"),
    bullet(report.decision.reasons),
    "",
    ...renderDecisionArbitration(report.decision),
    heading(2, "Convergence"),
    table(
      ["Field", "Value"],
      [
        ["Status", report.convergence.status],
        ["Stop", report.convergence.shouldStop ? "yes" : "no"],
        ["Stop reason", report.convergence.stopReason ?? "none"],
        ["Repeated", report.convergence.repeated ? "yes" : "no"],
        ["Fingerprint", code(report.convergence.fingerprint.value)],
        ["Previous fingerprint", report.convergence.previousFingerprint ? code(report.convergence.previousFingerprint) : "none"]
      ]
    ),
    "",
    heading(2, "Loop Iterations"),
    table(
      ["Loop", "Decision", "Convergence", "Fingerprint", "Exit", "Changed files", "Directory"],
      report.iterations.map((iteration) => [
        String(iteration.index),
        iteration.decision.action,
        iteration.convergence.status,
        code(iteration.convergence.fingerprint.value.slice(0, 12)),
        String(iteration.executorResult.exitCode ?? "unknown"),
        String(iteration.changedFiles.length),
        code(iteration.dir)
      ])
    ),
    "",
    heading(2, "Executor Result"),
    table(
      ["Field", "Value"],
      [
        ["Exit code", String(report.executorResult.exitCode ?? "unknown")],
        ["Command", report.executorResult.command ? code(report.executorResult.command) : "none"],
        ["Events", report.executorResult.eventsPath ? code(report.executorResult.eventsPath) : "none"],
        ["Diff", report.executorResult.diffPath ? code(report.executorResult.diffPath) : "none"]
      ]
    ),
    "",
    heading(2, "Changed Files"),
    bullet(report.changedFiles.map(code)),
    "",
    heading(2, "Policy Summary"),
    table(
      ["Signal", "Count"],
      [
        ["Passed", report.policy.passed ? "yes" : "no"],
        ["Fail on", report.policy.failOn],
        ["Forbidden", String(report.policy.summary.forbidden)],
        ["Required missing", String(report.policy.summary.requiredMissing)],
        ["Risks", String(report.policy.summary.risks)],
        ["Required satisfied", String(report.policy.summary.requiredSatisfied)]
      ]
    ),
    "",
    heading(2, "Loop Decisions"),
    bullet(report.loop.decisions.map((decision) => `${decision.action}: ${decision.reason}`)),
    "",
    heading(2, "Artifacts"),
    bullet(
      [
        ...report.artifacts.orchestratorFiles,
        ...report.artifacts.iterationFiles,
        report.artifacts.checkpointFile ? report.artifacts.checkpointFile : "",
        report.artifacts.sandboxGatewayManifest ? report.artifacts.sandboxGatewayManifest : "",
        report.artifacts.sandboxPatchFile ? report.artifacts.sandboxPatchFile : "",
        report.artifacts.memoryCandidateFile ? report.artifacts.memoryCandidateFile : ""
      ]
        .filter(Boolean)
        .map(code)
    )
  ].join("\n");
}

function renderDecisionArbitration(decision: HarnessDecision): string[] {
  const arbitration = decision.arbitration;
  if (!arbitration) return [];
  return [
    heading(2, "Decision Arbitration"),
    table(
      ["Field", "Value"],
      [
        ["Selected candidate", arbitration.selectedCandidate.id],
        ["Selected source", arbitration.selectedCandidate.source],
        ["Selected action", arbitration.selectedCandidate.action],
        ["Selected priority", String(arbitration.selectedPriority)],
        ["Supporting candidates", String(arbitration.supportingCandidates.length)]
      ]
    ),
    "",
    heading(3, "Supporting Candidates"),
    table(
      ["Candidate", "Source", "Action", "Priority", "Reason"],
      arbitration.supportingCandidates.map((candidate) => [
        candidate.id,
        candidate.source,
        candidate.action,
        String(candidate.priority),
        (candidate.reasons[0] ?? "none").replace(/\|/g, "\\|")
      ])
    ),
    ""
  ];
}

function createAgentExecutor(name: AgentExecutorName): AgentExecutor {
  return async (input) => {
    if (input.dryRun || name === "mock") return runMockExecutor(name, input);
    if (!input.executorCommand) {
      return {
        executor: name,
        exitCode: 2,
        stdout: "",
        stderr: `No executor command configured for ${name}. Pass --executor-command with placeholders such as {prompt}, {task}, {repo}, and {runDir}.`,
        changedFiles: collectChangedFiles(input.repo, input.base),
        sandboxMode: input.sandboxHandle.mode,
        sandboxRoot: input.sandboxHandle.root
      };
    }
    return runShellExecutor(name, input);
  };
}

async function runMockExecutor(name: AgentExecutorName, input: AgentExecutorInput): Promise<AgentExecutorResult> {
  const startedAt = new Date().toISOString();
  const workingTreeHashBefore = currentWorkingTreeHash(input.repo);
  const eventsPath = path.join(input.runDir, "executor.mock.json");
  writeFileSync(
    eventsPath,
    `${JSON.stringify(
      {
        executor: name,
        task: input.task,
        dryRun: true,
        note: "Mock executor does not edit files. It exercises the harness-led orchestration path."
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  const diffPath = writePatchSnapshot(input.hostRepo, input.runDir, "mock", await input.sandbox.exportPatch());
  const finishedAt = new Date().toISOString();
  const workingTreeHashAfter = currentWorkingTreeHash(input.repo);
  const stdout = "mock executor completed without editing files";
  const stderr = "";
  return {
    executor: name,
    exitCode: 0,
    eventsPath: path.relative(input.hostRepo, eventsPath).replaceAll("\\", "/"),
    stdout,
    stderr,
    changedFiles: collectChangedFiles(input.repo, input.base),
    diffPath,
    startedAt,
    finishedAt,
    stdoutHash: hashText(stdout),
    stderrHash: hashText(stderr),
    workingTreeHashBefore,
    workingTreeHashAfter,
    sandboxMode: input.sandboxHandle.mode,
    sandboxRoot: input.sandboxHandle.root
  };
}

async function runShellExecutor(name: AgentExecutorName, input: AgentExecutorInput): Promise<AgentExecutorResult> {
  const command = expandExecutorCommand(input.executorCommand ?? "", input);
  input.onProgress?.({ at: new Date().toISOString(), phase: "execute", message: `executor command: ${command}` });
  const startedHash = currentWorkingTreeHash(input.repo);
  const startedAt = new Date().toISOString();
  let result: ExecResult;
  try {
    result = await input.sandbox.execute(command, {
      timeoutMs: input.executorTimeoutMs,
      idleTimeoutMs: input.executorIdleTimeoutMs,
      onStdout: (text) => input.onExecutorOutput?.({ stream: "stdout", text }),
      onStderr: (text) => input.onExecutorOutput?.({ stream: "stderr", text })
    });
  } catch (error) {
    result = {
      command,
      file: "",
      args: [],
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      status: 2,
      error: error instanceof Error ? error : undefined
    };
  }
  const finishedAt = new Date().toISOString();
  const finishedHash = currentWorkingTreeHash(input.repo);
  const stdout = result.stdout;
  const stderr = result.stderr;
  const exitCode = result.status;
  const eventsPath = writeExecutorEvents(input.hostRepo, input.runDir, name, {
    command,
    exitCode,
    startedAt,
    finishedAt,
    workingTreeHashBefore: startedHash,
    workingTreeHashAfter: finishedHash,
    stdoutHash: hashText(stdout),
    stderrHash: hashText(stderr)
  });
  const diffPath = writePatchSnapshot(input.hostRepo, input.runDir, name, await input.sandbox.exportPatch());

  return {
    executor: name,
    exitCode,
    command,
    eventsPath,
    stdout,
    stderr,
    changedFiles: collectChangedFiles(input.repo, input.base),
    diffPath,
    startedAt,
    finishedAt,
    stdoutHash: hashText(stdout),
    stderrHash: hashText(stderr),
    workingTreeHashBefore: startedHash,
    workingTreeHashAfter: finishedHash,
    sandboxMode: input.sandboxHandle.mode,
    sandboxRoot: input.sandboxHandle.root
  };
}

function buildExecutorPrompt(
  context: ContextPackage,
  taskRun: TaskRunWriteResult,
  executorName: AgentExecutorName,
  options: HarnessOrchestratorOptions,
  previousDecision: HarnessOrchestratorReport["decision"] | undefined,
  loopIndex: number
): string {
  const promptFile = promptFileFor(context.scan.root, taskRun.runId, executorName);
  const basePrompt = existsSync(promptFile)
    ? readFileSync(promptFile, "utf8")
    : [
        `Task: ${taskRun.manifest.task}`,
        `Run directory: ${path.relative(context.scan.root, taskRun.dir).replaceAll("\\", "/")}`,
        "Read plan.md, edit-boundary.md, pack.md, tests.md, impact.md, then make the minimal code change."
      ].join("\n");

  return [
    basePrompt.trim(),
    "",
    "Harness control-plane requirements:",
    "- OpenCode++ provides context, boundaries, trace evidence, policy, impact, verify, and final gate decision reports.",
    "- The selected code agent owns reading source files, editing code, and running commands.",
    "- Inspect relevant source files before behavior-changing edits.",
    "- Keep changes inside the edit boundary unless the task cannot be completed otherwise.",
    "- Prefer command evidence for tests and verification.",
    `- Executor: ${executorName}`,
    `- Loop iteration: ${loopIndex} / ${options.maxLoops ?? 1}`,
    ...(previousDecision
      ? [
          "",
          "Previous harness decision:",
          `- Action: ${previousDecision.action}`,
          ...previousDecision.reasons.map((reason) => `- Reason: ${reason}`),
          ...previousDecision.requiredCommands.map((command) => `- Suggested command: ${command}`)
        ].filter(Boolean)
      : [])
  ].join("\n");
}

function promptFileFor(root: string, runId: string, executorName: AgentExecutorName): string {
  const promptName =
    executorName === "claude-code"
      ? "prompt.claude.md"
      : executorName === "cursor"
        ? "prompt.cursor.md"
        : executorName === "codex"
          ? "prompt.codex.md"
          : "prompt.opencode.md";
  return path.join(root, ".agent-context", "runs", runId, promptName);
}

function appendExecutorTrace(
  root: string,
  traceId: string,
  executorName: AgentExecutorName,
  executorResult: AgentExecutorResult,
  loopIndex: number,
  warnings: string[] = []
): void {
  appendExecutionTraceStep(root, traceId, {
    agent: executorName,
    action: "agent-execute",
    files: executorResult.changedFiles,
    command: executorResult.command,
    reason: `Loop ${loopIndex}: ${executorName} executor returned exit code ${executorResult.exitCode ?? "unknown"}.`,
    result: executorResult.exitCode === 0 ? "passed" : "failed",
    finalState: executorResult.exitCode === 0 ? "partial_success" : "blocked",
    evidenceSource: executorResult.command ? "command" : "manual",
    capturedBy: executorResult.command ? "opencode-plusplus" : "external",
    exitCode: executorResult.exitCode,
    output: summarizeOutput(executorResult.stdout, executorResult.stderr, warnings),
    startedAt: executorResult.startedAt,
    finishedAt: executorResult.finishedAt,
    stdoutHash: executorResult.stdoutHash,
    stderrHash: executorResult.stderrHash,
    workingTreeHashBefore: executorResult.workingTreeHashBefore,
    workingTreeHashAfter: executorResult.workingTreeHashAfter
  });
}

function appendAgentEventsToTrace(root: string, traceId: string, executorName: AgentExecutorName, events: AgentEvent[]): void {
  for (const event of events) {
    if (event.type === "message") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "message",
        reason: event.role,
        output: event.text,
        evidenceSource: "manual"
      });
    } else if (event.type === "tool_call") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "tool-call",
        reason: event.tool,
        output: safeStringify(event.args),
        evidenceSource: "manual"
      });
    } else if (event.type === "file_read") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "file-read",
        files: [event.path],
        evidenceSource: "manual"
      });
    } else if (event.type === "file_edit") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "edit",
        files: [event.path],
        evidenceSource: "manual"
      });
    } else if (event.type === "command_run" || event.type === "test_run") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: event.type === "test_run" ? "run-test" : "run-command",
        command: event.command,
        result: event.exitCode === undefined ? "unknown" : event.exitCode === 0 ? "passed" : "failed",
        evidenceSource: "command",
        capturedBy: "external",
        exitCode: event.exitCode,
        startedAt: event.ts,
        finishedAt: event.ts
      });
    } else if (event.type === "error") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "error",
        result: "failed",
        output: event.message,
        evidenceSource: "manual"
      });
    }
  }
}

function writeIterationArtifacts(root: string, iterationDir: string, input: IterationArtifactInput): string[] {
  const generatedAt = new Date().toISOString();
  const trace = readExecutionTrace(root, input.runId);
  const executorArtifact = {
    schemaVersion: "opencode-plusplus.executor-result.v1",
    kind: "executor-result",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    summary: {
      executor: input.executorResult.executor,
      exitCode: input.executorResult.exitCode,
      command: input.executorResult.command,
      changedFiles: input.executorResult.changedFiles,
      events: input.executorResult.normalizedEventsCount ?? input.agentEvents.length,
      normalizerSource: input.executorResult.normalizerSource ?? "unknown",
      sandboxMode: input.executorResult.sandboxMode ?? "host"
    },
    executorResult: input.executorResult
  };
  const traceArtifact = {
    schemaVersion: "opencode-plusplus.trace-artifact.v1",
    kind: "trace",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    summary: {
      traceLoaded: Boolean(trace),
      steps: trace?.steps.length ?? 0,
      commandEvidence: trace?.steps.filter((step) => step.evidenceSource === "command").length ?? 0,
      filesTouched: [...new Set(trace?.steps.flatMap((step) => step.files) ?? [])].sort()
    },
    trace
  };
  const decisionArtifact = {
    schemaVersion: "opencode-plusplus.decision.v1",
    kind: "decision",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    priorityOrder: ORCHESTRATOR_DECISION_PRIORITY,
    inputs: {
      executorExitCode: input.executorResult.exitCode,
      changedFiles: input.executorResult.changedFiles,
      policy: input.policy.summary,
      loopStatus: input.loop.status,
      loopRisk: input.loop.risk,
      guardFindings: input.guardFindings.summary,
      guardGates: input.guardGates.summary
    },
    convergence: input.convergence,
    arbitration: input.decision.arbitration,
    decision: input.decision
  };
  const iterationArtifact = {
    schemaVersion: "opencode-plusplus.iteration.v1",
    kind: "iteration",
    generatedAt,
    runId: input.runId,
    iteration: input.iteration,
    directory: path.relative(root, iterationDir).replaceAll("\\", "/"),
    artifacts: {
      prompt: "prompt.md",
      executorEvents: "executor.events.jsonl",
      executorResult: "executor.result.json",
      diff: "diff.patch",
      trace: "trace.json",
      guardFindings: "guard.findings.json",
      guardGates: "guard.gates.json",
      policy: "policy.json",
      verify: "verify.json",
      loop: "loop.json",
      decision: "decision.json"
    },
    convergence: input.convergence,
    summary: {
      executor: input.executorResult.executor,
      exitCode: input.executorResult.exitCode,
      changedFiles: input.executorResult.changedFiles.length,
      guardFindings: input.guardFindings.summary.total,
      guardGates: input.guardGates.summary.blocking,
      policyPassed: input.policy.passed,
      loopStatus: input.loop.status,
      decision: input.decision.action,
      selectedCandidate: input.decision.arbitration?.selectedCandidate.id,
      supportingCandidates: input.decision.arbitration?.supportingCandidates.length ?? 0,
      convergence: input.convergence.status,
      fingerprint: input.convergence.fingerprint.value
    }
  };
  const files = [
    input.promptFile,
    write(path.join(iterationDir, "iteration.json"), JSON.stringify(iterationArtifact, null, 2)),
    write(path.join(iterationDir, "executor.events.jsonl"), formatAgentEvents(input.agentEvents)),
    write(path.join(iterationDir, "executor.result.json"), JSON.stringify(executorArtifact, null, 2)),
    write(path.join(iterationDir, "hallucination.json"), JSON.stringify(input.hallucination, null, 2)),
    write(path.join(iterationDir, "hallucination.md"), renderHallucinationReport(input.hallucination)),
    write(path.join(iterationDir, "regression.json"), JSON.stringify(input.regression, null, 2)),
    write(path.join(iterationDir, "regression.md"), renderRegressionReport(input.regression)),
    write(path.join(iterationDir, "guard.findings.json"), JSON.stringify(input.guardFindings, null, 2)),
    write(path.join(iterationDir, "guard.gates.json"), JSON.stringify(input.guardGates, null, 2)),
    write(path.join(iterationDir, "policy.json"), JSON.stringify(input.policy, null, 2)),
    write(path.join(iterationDir, "verify.json"), JSON.stringify({ markdown: input.verify }, null, 2)),
    write(path.join(iterationDir, "loop.json"), JSON.stringify(input.loop, null, 2)),
    write(path.join(iterationDir, "decision.json"), JSON.stringify(decisionArtifact, null, 2)),
    write(path.join(iterationDir, "trace.json"), JSON.stringify(traceArtifact, null, 2))
  ];

  if (input.executorResult.diffPath) {
    const diffSource = path.join(root, input.executorResult.diffPath);
    const diffTarget = path.join(iterationDir, "diff.patch");
    if (existsSync(diffSource)) {
      copyFileSync(diffSource, diffTarget);
    } else {
      writeFileSync(diffTarget, "", "utf8");
    }
    files.push(diffTarget);
  }

  return files;
}

function writeAgentEvents(iterationDir: string, events: AgentEvent[]): string {
  const filePath = path.join(iterationDir, "executor.events.jsonl");
  writeFileSync(filePath, formatAgentEvents(events), "utf8");
  return filePath;
}

function formatAgentEvents(events: AgentEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createCheckpoint(root: string, runId: string, runDir: string, mode: OrchestratorCheckpointMode): { relativePath: string } | undefined {
  if (mode === "none") return undefined;
  const filePath = path.join(runDir, "checkpoint.patch");
  let patch = "";
  try {
    patch = runGit(root, ["diff", "--binary", "--", ".", ":(exclude).agent-context/**", ":(exclude)AGENTS.md"]);
  } catch (error) {
    patch = `Unable to create checkpoint patch: ${error instanceof Error ? error.message : String(error)}\n`;
  }
  writeFileSync(
    filePath,
    [
      `# checkpoint for ${runId}`,
      "# mode: git-worktree",
      "# This file captures the source diff before executor loops. OpenCode++ does not run destructive rollback commands automatically.",
      "",
      patch
    ].join("\n"),
    "utf8"
  );
  return { relativePath: path.relative(root, filePath).replaceAll("\\", "/") };
}

function createSandboxAdapter(mode: OrchestratorCheckpointMode): SandboxAdapter {
  return mode === "git-worktree" ? new GitWorktreeSandboxAdapter() : new HostSandboxAdapter();
}

function expandExecutorCommand(command: string, input: AgentExecutorInput): string {
  const promptFile = path.join(input.runDir, "executor-prompt.md");
  writeFileSync(promptFile, `${input.prompt.trim()}\n`, "utf8");
  const executorPromptFile = writeExecutorPromptForRepo(input, promptFile);
  const replacements: Record<string, string> = {
    "{prompt}": quote(executorPromptFile),
    "{task}": quote(input.task),
    "{repo}": quote(input.repo),
    "{runDir}": quote(input.runDir),
    "{agent}": quote(input.agent ?? "")
  };
  let expanded = command;
  for (const [token, value] of Object.entries(replacements)) expanded = expanded.replaceAll(token, value);
  return expanded;
}

function writeExecutorPromptForRepo(input: AgentExecutorInput, hostPromptFile: string): string {
  if (path.resolve(input.repo) === path.resolve(input.hostRepo)) return hostPromptFile;
  const promptDir = path.join(input.repo, ".agent-context", "executor-prompts", input.runId);
  mkdirSync(promptDir, { recursive: true });
  const promptFile = path.join(promptDir, path.basename(input.runDir));
  writeFileSync(promptFile, readFileSync(hostPromptFile, "utf8"), "utf8");
  return promptFile;
}

function writeExecutorEvents(root: string, runDir: string, executor: AgentExecutorName, event: Record<string, string | number | null>): string {
  const filePath = path.join(runDir, `executor.${executor}.json`);
  writeFileSync(filePath, `${JSON.stringify({ executor, ...event }, null, 2)}\n`, "utf8");
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function writePatchSnapshot(hostRoot: string, runDir: string, executor: AgentExecutorName, patch: string): string {
  const filePath = path.join(runDir, `diff.${executor}.patch`);
  writeFileSync(filePath, patch, "utf8");
  return path.relative(hostRoot, filePath).replaceAll("\\", "/");
}

function collectChangedFiles(root: string, base: string): string[] {
  const files = new Set<string>();
  try {
    for (const file of changedFilesSince(root, base)) {
      if (!isHarnessGeneratedPath(file)) files.add(file);
    }
  } catch {
    // Status-only collection below still captures useful local evidence.
  }
  try {
    for (const line of runGit(root, ["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/)) {
      if (line.length <= 3) continue;
      const file = line.slice(3).trim().replace(/\\/g, "/").split(" -> ").pop();
      if (file && !isHarnessGeneratedPath(file)) files.add(file);
    }
  } catch {
    return [...files].sort();
  }
  return [...files].sort();
}

function mirrorTraceForEvaluation(hostRoot: string, evaluationRoot: string, traceId: string): void {
  if (path.resolve(hostRoot) === path.resolve(evaluationRoot)) return;
  const trace = readExecutionTrace(hostRoot, traceId);
  if (!trace) return;
  const traceDir = path.join(evaluationRoot, ".agent-context", "traces");
  mkdirSync(traceDir, { recursive: true });
  writeFileSync(path.join(traceDir, `${traceId}.json`), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}

function isHarnessGeneratedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized === "AGENTS.md" || normalized.startsWith(".agent-context/");
}

function write(filePath: string, content: string): string {
  writeFileSync(filePath, `${content.trim()}\n`, "utf8");
  return filePath;
}

function quote(value: string): string {
  return shellQuote(value);
}

function summarizeOutput(stdout: string, stderr: string, warnings: string[] = []): string {
  const combined = [stdout.trim(), stderr.trim(), ...warnings.map((warning) => `normalizer warning: ${warning}`)].filter(Boolean).join("\n--- stderr ---\n");
  if (!combined) return "";
  return combined.length > 2000 ? `${combined.slice(0, 2000)}\n... truncated ...` : combined;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
