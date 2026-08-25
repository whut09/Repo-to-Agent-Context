import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ContextPackage, EvidencePolicyMode, TaskType } from "../../core/types.js";
import { buildContextPackage } from "../../core/context-builder.js";
import { runGit } from "../../core/git.js";
import { GitWorktreeSandboxAdapter } from "../../sandbox/git-worktree-sandbox.js";
import { HostSandboxAdapter } from "../../sandbox/host-sandbox.js";
import type { SandboxAdapter, SandboxHandle } from "../../sandbox/sandbox-adapter.js";
import type { AgentEvent } from "../../outputs/agent-events.js";
import { writeContextPackage } from "../../outputs/renderers/writer.js";
import { renderChangeImpactReport } from "../../outputs/impact.js";
import { writeFinalizeMemoryCandidate } from "../verification-plane/guards/regression-memory.js";
import { renderLoopControllerReport, type LoopControllerReport } from "./loop-controller.js";
import { renderPolicyReport, type PolicyFailOn, type PolicyEngineReport } from "../verification-plane/policy-engine.js";
import { renderTaskVerify } from "../../outputs/task-harness.js";
import { writeTaskRun } from "../../outputs/task-run.js";
import { appendExecutionTraceStep, currentWorkingTreeHash, readExecutionTrace } from "../observability/execution-trace.js";
import type { GuardGateReport } from "../../outputs/guard-gates.js";
import type { HarnessDecision, HarnessDecisionAction } from "../types.js";
import { HARNESS_DECISION_PRIORITY, maxLoopHarnessDecision, noProgressHarnessDecision } from "./decision-engine.js";
import { buildIterationStateFingerprint, evaluateConvergence, type ConvergenceResult } from "./convergence.js";
import { OrchestratorArtifactRepository } from "./artifact-repository.js";
import {
  completePhase,
  OrchestratorInterruptedError,
  OrchestratorStateRepository,
  type OrchestratorPhase,
  type OrchestratorRunState
} from "./orchestrator-state.js";
import { runCollectPhase, type CollectPhaseOutput } from "./phases/collect.js";
import { runDecidePhase } from "./phases/decide.js";
import { runEvaluatePhase, type EvaluatePhaseOutput } from "./phases/evaluate.js";
import { runExecutePhase } from "./phases/execute.js";
import { runPlanPhase } from "./phases/plan.js";
import { runPrepareSandboxPhase } from "./phases/prepare-sandbox.js";
import { runPersistPhase } from "./phases/persist.js";
import { buildExecutorPrompt, collectChangedFiles, createAgentExecutor } from "./orchestrator-executors.js";
import { writeIterationArtifacts } from "./iteration-artifacts.js";
import { combineContextRefreshMetrics, initialContextMetrics, refreshHarnessContext, type ContextRefreshMetrics } from "./context-refresh.js";
import { renderOrchestratorReport } from "./orchestrator-report.js";
import { recordIterationInterventions } from "../observability/intervention-mapper.js";

export { renderOrchestratorReport } from "./orchestrator-report.js";

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
  resumeRunId?: string;
  interruptAfterPhase?: OrchestratorPhase;
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
  modifiedFiles?: string[];
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
    stateFile?: string;
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
  contextRefresh?: ContextRefreshMetrics;
  files: string[];
}

export interface HarnessOrchestratorWriteResult {
  report: HarnessOrchestratorReport;
  files: string[];
}

export async function runHarnessOrchestrator(repo: string, task: string, options: HarnessOrchestratorOptions = {}): Promise<HarnessOrchestratorWriteResult> {
  const base = options.base ?? "main";
  const executorName = options.executor ?? "mock";
  const maxLoops = Math.max(1, options.maxLoops ?? 1);
  const root = path.resolve(repo);
  const stateRepository = new OrchestratorStateRepository(root);
  const artifactRepository = new OrchestratorArtifactRepository(root);
  const progress = (phase: HarnessProgressEvent["phase"], message: string, loop?: number) => {
    options.onProgress?.({ at: new Date().toISOString(), phase, message, loop });
  };

  if (options.resumeRunId) {
    const completed = stateRepository.load(options.resumeRunId);
    if (completed?.currentPhase === "completed") {
      validateResumeState(completed, root, task);
      return loadCompletedRun(root, completed.runId);
    }
  }

  progress("context", `building repository context for ${root}`);
  const initialContextStartedAt = performance.now();
  const preContext = await buildContextPackage(root);
  let startupContextRefresh = initialContextMetrics(preContext, performance.now() - initialContextStartedAt);
  progress("context", "writing context package");
  const contextWrite = writeContextPackage(preContext);
  const executor = createAgentExecutor(executorName);
  progress("plan", "writing task run and edit boundary");
  const taskRun = writeTaskRun(preContext, task, { base, type: options.type ?? "auto", tokenBudget: options.tokenBudget, preserveTrace: true });
  if (options.resumeRunId && options.resumeRunId !== taskRun.runId) {
    throw new Error(`Cannot resume run ${options.resumeRunId} for task ${taskRun.runId}.`);
  }
  const dir = path.join(root, ".agent-context", "orchestrator", taskRun.runId);
  mkdirSync(dir, { recursive: true });
  let state =
    stateRepository.load(taskRun.runId) ??
    stateRepository.create({
      runId: taskRun.runId,
      task,
      repo: root,
      traceReference: path.relative(root, path.join(root, ".agent-context", "traces", `${taskRun.runId}.json`)).replaceAll("\\", "/"),
      contextFingerprint: contextFingerprint(preContext),
      workingTreeHash: currentWorkingTreeHash(root)
    });
  validateResumeState(state, root, task);
  const advance = (
    phase: OrchestratorPhase,
    nextPhase: OrchestratorPhase,
    updates: Partial<Omit<OrchestratorRunState, "schemaVersion" | "runId" | "createdAt">> = {}
  ) => {
    state = stateRepository.save(completePhase(state, phase, nextPhase, updates));
    if (options.interruptAfterPhase === phase) throw new OrchestratorInterruptedError(state.runId, phase);
  };
  if (state.currentPhase === "plan" && state.currentIteration === 1 && state.completedPhases.length === 0) {
    advance("plan", "prepare-sandbox");
  }

  const checkpoint = createCheckpoint(root, taskRun.runId, taskRun.dir, options.checkpoint ?? "none");
  const sandbox = createSandboxAdapter(options.checkpoint ?? "none");
  progress("sandbox", `preparing ${options.checkpoint ?? "none"} sandbox`);
  const sandboxHandle = (await runPrepareSandboxPhase({ sandbox, runId: taskRun.runId, repo: root })).handle;
  let sandboxDiscarded = sandboxHandle.mode === "host";
  const iterations = loadPersistedIterationReports(root, taskRun.dir);
  let previousDecision = iterations.at(-1)?.decision;
  let latestContext = preContext;
  let contextWorkingTreeHash = currentWorkingTreeHash(root);
  try {
    if (sandboxHandle.mode === "git-worktree") {
      progress("context", "building context inside git-worktree sandbox");
      const sandboxContextStartedAt = performance.now();
      latestContext = await buildContextPackage(sandboxHandle.root);
      startupContextRefresh = combineContextRefreshMetrics(
        startupContextRefresh,
        initialContextMetrics(latestContext, performance.now() - sandboxContextStartedAt)
      );
      contextWorkingTreeHash = currentWorkingTreeHash(sandboxHandle.root);
      writeContextPackage(latestContext);
      writeTaskRun(latestContext, task, { base, type: options.type ?? "auto", tokenBudget: options.tokenBudget, preserveTrace: true });
      mirrorTraceForEvaluation(root, sandboxHandle.root, taskRun.runId);
      restoreSandboxForResume(root, sandboxHandle.root, state, artifactRepository);
    }
    if (state.currentPhase === "prepare-sandbox") {
      const initialPlan = runPlanPhase({ runDir: taskRun.dir, iteration: state.currentIteration, previousDecision });
      mkdirSync(initialPlan.iterationDir, { recursive: true });
      write(
        path.join(initialPlan.iterationDir, "prompt.md"),
        buildExecutorPrompt(latestContext, taskRun, executorName, options, previousDecision, state.currentIteration)
      );
      advance("prepare-sandbox", "execute", {
        contextFingerprint: contextFingerprint(latestContext),
        workingTreeHash: currentWorkingTreeHash(sandboxHandle.root)
      });
    }
  } catch (error) {
    if (sandboxHandle.mode === "git-worktree" && !sandboxDiscarded) await sandbox.discard();
    throw error;
  }
  let latestExecutorResult: AgentExecutorResult | undefined;
  let latestPolicy: PolicyEngineReport | undefined;
  let latestLoop: LoopControllerReport | undefined;
  let latestGuardGates: GuardGateReport | undefined;
  let latestChangedFiles: string[] = [];
  let latestDecision: HarnessOrchestratorReport["decision"] | undefined;
  let latestConvergence: ConvergenceResult | undefined;
  let previousFingerprint = iterations.at(-1)?.convergence.fingerprint;
  if (state.currentPhase === "finalize") {
    const persisted = iterations.at(-1);
    if (!persisted || !state.latestDecision || !state.convergence) throw new Error(`Run ${state.runId} is missing persisted final iteration state.`);
    const evaluated = loadEvaluation(state, artifactRepository);
    latestExecutorResult = loadExecutorResult(state, artifactRepository);
    latestPolicy = evaluated.policy;
    latestLoop = evaluated.loop;
    latestGuardGates = evaluated.guardGates;
    latestChangedFiles = evaluated.changedFiles;
    latestDecision = state.latestDecision;
    latestConvergence = state.convergence;
    latestContext = await buildContextPackage(sandboxHandle.root);
  }

  try {
    for (let loopIndex = state.currentIteration; state.currentPhase !== "finalize" && loopIndex <= maxLoops; loopIndex = state.currentIteration) {
      progress("plan", `starting loop ${loopIndex} of ${maxLoops}`, loopIndex);
      const plan = runPlanPhase({ runDir: taskRun.dir, iteration: loopIndex, previousDecision });
      let iterationContextRefresh: ContextRefreshMetrics | undefined = loopIndex === 1 && iterations.length === 0 ? startupContextRefresh : undefined;
      mkdirSync(plan.iterationDir, { recursive: true });
      if (state.currentPhase === "plan") {
        if (plan.refreshContext) {
          progress("context", "refreshing context for next loop", loopIndex);
          const refreshed = await refreshHarnessContext({
            root: sandboxHandle.root,
            context: latestContext,
            previousDecisionAction: previousDecision?.action,
            contextWorkingTreeHash,
            currentWorkingTreeHash: currentWorkingTreeHash(sandboxHandle.root),
            modifiedFiles: []
          });
          latestContext = refreshed.context;
          iterationContextRefresh = iterationContextRefresh ? combineContextRefreshMetrics(iterationContextRefresh, refreshed.metrics) : refreshed.metrics;
          contextWorkingTreeHash = currentWorkingTreeHash(sandboxHandle.root);
          writeContextPackage(latestContext);
          writeTaskRun(latestContext, task, { base, type: options.type ?? "auto", tokenBudget: options.tokenBudget, preserveTrace: true });
          mirrorTraceForEvaluation(root, sandboxHandle.root, taskRun.runId);
        }
        write(path.join(plan.iterationDir, "prompt.md"), buildExecutorPrompt(latestContext, taskRun, executorName, options, previousDecision, loopIndex));
        advance("plan", "execute", {
          contextFingerprint: contextFingerprint(latestContext),
          workingTreeHash: currentWorkingTreeHash(sandboxHandle.root),
          executorResultReference: undefined,
          evaluationReference: undefined,
          iterationReference: undefined
        });
      }

      const promptFile = path.join(plan.iterationDir, "prompt.md");
      if (state.currentPhase === "execute") {
        progress("execute", `launching ${executorName} executor`, loopIndex);
        const executed = await runExecutePhase({
          executor,
          executorInput: {
            repo: sandboxHandle.root,
            hostRepo: root,
            task,
            prompt: readFileSync(promptFile, "utf8"),
            runDir: plan.iterationDir,
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
          }
        });
        latestExecutorResult = executed.executorResult;
        const reference = artifactRepository.writeJson(path.join(plan.iterationDir, "phase.execute.json"), latestExecutorResult);
        advance("execute", "collect", {
          executorResultReference: reference,
          workingTreeHash: currentWorkingTreeHash(sandboxHandle.root)
        });
      } else {
        latestExecutorResult = loadExecutorResult(state, artifactRepository);
      }
      const executorResult = latestExecutorResult;
      if (!executorResult) throw new Error(`Run ${state.runId} is missing executor result for iteration ${loopIndex}.`);
      progress("collect", `${executorName} executor finished with exit code ${executorResult.exitCode ?? "unknown"}`, loopIndex);

      let collected: CollectPhaseOutput;
      if (state.currentPhase === "collect") {
        progress("collect", "normalizing executor events", loopIndex);
        collected = runCollectPhase({ executorResult, repo: sandboxHandle.root, transcriptPath: options.opencodeTranscript });
        const normalizedEventsPath = writeAgentEvents(plan.iterationDir, collected.events);
        executorResult.normalizedEventsPath = path.relative(root, normalizedEventsPath).replaceAll("\\", "/");
        executorResult.normalizedEventsCount = collected.events.length;
        executorResult.normalizerSource = collected.source;
        appendAgentEventsToTrace(root, taskRun.runId, executorName, collected.events, loopIndex);
        appendExecutorTrace(root, taskRun.runId, executorName, executorResult, loopIndex, collected.warnings);
        mirrorTraceForEvaluation(root, sandboxHandle.root, taskRun.runId);
        artifactRepository.writeJson(path.join(plan.iterationDir, "phase.collect.json"), collected);
        artifactRepository.writeJson(path.join(plan.iterationDir, "phase.execute.json"), executorResult);
        advance("collect", "evaluate", { workingTreeHash: currentWorkingTreeHash(sandboxHandle.root) });
      } else {
        collected = artifactRepository.readJson<CollectPhaseOutput>(artifactRepository.relative(path.join(plan.iterationDir, "phase.collect.json")));
      }

      let evaluated: EvaluatePhaseOutput & { changedFiles: string[]; contextRefresh: ContextRefreshMetrics };
      if (state.currentPhase === "evaluate") {
        progress("evaluate", "running hallucination, regression, impact, policy, and verify checks", loopIndex);
        const currentHash = currentWorkingTreeHash(sandboxHandle.root);
        const refreshed = await refreshHarnessContext({
          root: sandboxHandle.root,
          context: latestContext,
          previousDecisionAction: plan.refreshContext ? undefined : previousDecision?.action,
          contextWorkingTreeHash,
          currentWorkingTreeHash: currentHash,
          modifiedFiles: executorResult.modifiedFiles
        });
        latestContext = refreshed.context;
        contextWorkingTreeHash = currentHash;
        iterationContextRefresh = iterationContextRefresh ? combineContextRefreshMetrics(iterationContextRefresh, refreshed.metrics) : refreshed.metrics;
        const changedFiles = collectChangedFiles(sandboxHandle.root, base);
        evaluated = {
          ...runEvaluatePhase({
            context: latestContext,
            hostRoot: root,
            task,
            runId: taskRun.runId,
            iteration: loopIndex,
            base,
            previousAction: previousDecision?.action,
            type: options.type ?? "auto",
            tokenBudget: options.tokenBudget,
            failOn: options.failOn ?? "required",
            evidencePolicy: options.evidencePolicy ?? latestContext.config.evidencePolicy,
            changedFiles,
            checkpointMode: options.checkpoint ?? "none"
          }),
          changedFiles,
          contextRefresh: iterationContextRefresh
        };
        const reference = artifactRepository.writeJson(path.join(plan.iterationDir, "phase.evaluate.json"), evaluated);
        advance("evaluate", "decide", {
          evaluationReference: reference,
          contextFingerprint: contextFingerprint(latestContext),
          workingTreeHash: currentWorkingTreeHash(sandboxHandle.root)
        });
      } else {
        evaluated = loadEvaluation(state, artifactRepository);
        iterationContextRefresh = evaluated.contextRefresh;
      }
      const { hallucination, regression, policy, verify, loop, guardFindings, guardGates, changedFiles, contextRefresh } = evaluated;
      latestPolicy = policy;
      latestLoop = loop;
      latestGuardGates = guardGates;
      latestChangedFiles = changedFiles;

      let decision: HarnessDecision;
      let convergence: ConvergenceResult;
      if (state.currentPhase === "decide") {
        decision = runDecidePhase({
          executorResult,
          changedFiles,
          policy,
          loop,
          guardGates,
          checkpointMode: options.checkpoint ?? "none"
        }).decision;
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
          contextDrift: loop.context.drift,
          taskId: taskRun.runId,
          sessionId: "orchestrator"
        });
        convergence = evaluateConvergence({
          fingerprint,
          previousFingerprint,
          decision,
          executorExitCode: executorResult.exitCode,
          loopIndex,
          maxLoops
        });
        if (convergence.status === "repeated-state") {
          decision = noProgressHarnessDecision(fingerprint.value, decision);
        } else if (convergence.status === "max-loops-reached") {
          decision = maxLoopHarnessDecision(maxLoops, decision);
        }
        artifactRepository.writeJson(path.join(plan.iterationDir, "phase.decide.json"), { decision, convergence });
        advance("decide", "persist", { latestDecision: decision, convergence });
      } else {
        if (!state.latestDecision || !state.convergence) throw new Error(`Run ${state.runId} is missing persisted decision state.`);
        decision = state.latestDecision;
        convergence = state.convergence;
      }
      latestDecision = decision;
      latestConvergence = convergence;
      progress("decision", `decision: ${decision.action}`, loopIndex);

      const interventionResult = recordIterationInterventions({
        root,
        taskId: taskRun.runId,
        sessionId: "orchestrator",
        iteration: loopIndex,
        changedFiles,
        currentWorkingTreeHash: currentWorkingTreeHash(sandboxHandle.root),
        trace: readExecutionTrace(root, taskRun.runId),
        policy,
        guardFindings,
        guardGates,
        decision,
        executorExitCode: executorResult.exitCode
      });
      decision = interventionResult.decision;
      latestDecision = decision;

      if (state.currentPhase !== "persist") throw new Error(`Unexpected orchestrator phase ${state.currentPhase} before persist.`);
      const iterationFiles = writeIterationArtifacts(root, plan.iterationDir, {
        runId: taskRun.runId,
        iteration: loopIndex,
        promptFile,
        executorResult,
        agentEvents: collected.events,
        hallucination,
        regression,
        policy,
        verify,
        loop,
        decision,
        convergence,
        guardFindings,
        guardGates,
        contextRefresh
      });
      const iterationReport = runPersistPhase({
        root,
        iteration: loopIndex,
        iterationDir: plan.iterationDir,
        promptFile,
        executorResult,
        changedFiles,
        policy,
        loop,
        guardGates,
        decision,
        convergence,
        contextRefresh,
        files: iterationFiles
      }).iterationReport;
      const iterationReference = artifactRepository.writeJson(path.join(plan.iterationDir, "iteration.report.json"), iterationReport);
      const existingIndex = iterations.findIndex((item) => item.index === loopIndex);
      if (existingIndex >= 0) iterations[existingIndex] = iterationReport;
      else iterations.push(iterationReport);

      latestExecutorResult = executorResult;
      previousDecision = decision;
      previousFingerprint = convergence.fingerprint;
      if (convergence.shouldStop) {
        advance("persist", "finalize", { iterationReference });
        break;
      }
      advance("persist", "plan", {
        currentIteration: loopIndex + 1,
        iterationReference,
        executorResultReference: undefined,
        evaluationReference: undefined
      });
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
        sandboxPatchFile: relativeOptional(root, sandboxHandle.patchPath),
        stateFile: path.relative(root, stateRepository.pathFor(taskRun.runId)).replaceAll("\\", "/")
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
    if (state.currentPhase === "finalize") {
      advance("finalize", "completed", { completedAt: new Date().toISOString(), latestDecision, convergence: latestConvergence });
    }
    progress("write", `wrote orchestrator report to ${path.relative(root, path.join(dir, "orchestrator.md")).replaceAll("\\", "/")}`);

    return { report, files };
  } finally {
    if (sandboxHandle.mode === "git-worktree" && !sandboxDiscarded) {
      await sandbox.discard();
    }
  }
}

function validateResumeState(state: OrchestratorRunState, root: string, task: string): void {
  if (path.resolve(state.repo) !== path.resolve(root)) throw new Error(`Run ${state.runId} belongs to a different repository: ${state.repo}.`);
  if (state.task !== task) throw new Error(`Run ${state.runId} belongs to task "${state.task}", not "${task}".`);
}

function contextFingerprint(context: ContextPackage): string {
  return hashText(
    JSON.stringify(
      context.scan.files
        .map((file) => ({ path: file.path, sizeBytes: file.sizeBytes, tokenEstimate: file.tokenEstimate }))
        .sort((a, b) => a.path.localeCompare(b.path))
    )
  );
}

function loadCompletedRun(root: string, runId: string): HarnessOrchestratorWriteResult {
  const reportPath = path.join(root, ".agent-context", "orchestrator", runId, "orchestrator.json");
  if (!existsSync(reportPath)) throw new Error(`Completed orchestrator run ${runId} is missing orchestrator.json.`);
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as HarnessOrchestratorReport;
  return {
    report,
    files: report.artifacts.orchestratorFiles.map((file) => path.join(root, file))
  };
}

function loadPersistedIterationReports(root: string, runDir: string): OrchestratorIterationReport[] {
  const iterationsDir = path.join(runDir, "iterations");
  if (!existsSync(iterationsDir)) return [];
  return readdirSync(iterationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(iterationsDir, entry.name, "iteration.report.json"))
    .filter(existsSync)
    .map((file) => JSON.parse(readFileSync(file, "utf8")) as OrchestratorIterationReport)
    .sort((a, b) => a.index - b.index)
    .map((report) => ({ ...report, dir: path.relative(root, path.resolve(root, report.dir)).replaceAll("\\", "/") }));
}

function loadExecutorResult(state: OrchestratorRunState, artifacts: OrchestratorArtifactRepository): AgentExecutorResult {
  if (!state.executorResultReference) throw new Error(`Run ${state.runId} has no executor result reference.`);
  return artifacts.readJson<AgentExecutorResult>(state.executorResultReference);
}

function loadEvaluation(
  state: OrchestratorRunState,
  artifacts: OrchestratorArtifactRepository
): EvaluatePhaseOutput & { changedFiles: string[]; contextRefresh: ContextRefreshMetrics } {
  if (!state.evaluationReference) throw new Error(`Run ${state.runId} has no evaluation reference.`);
  return artifacts.readJson<EvaluatePhaseOutput & { changedFiles: string[]; contextRefresh: ContextRefreshMetrics }>(state.evaluationReference);
}

function restoreSandboxForResume(hostRoot: string, sandboxRoot: string, state: OrchestratorRunState, artifacts: OrchestratorArtifactRepository): void {
  if (!state.executorResultReference || state.currentPhase === "execute" || state.currentPhase === "plan") return;
  if (currentWorkingTreeHash(sandboxRoot) === state.workingTreeHash) return;
  const executorResult = loadExecutorResult(state, artifacts);
  if (!executorResult.diffPath) return;
  const patchPath = path.resolve(hostRoot, executorResult.diffPath);
  if (!existsSync(patchPath)) throw new Error(`Cannot resume run ${state.runId}; executor patch is missing: ${executorResult.diffPath}.`);
  runGit(sandboxRoot, ["apply", "--whitespace=nowarn", patchPath]);
}

function relativeOptional(root: string, filePath: string | undefined): string | undefined {
  return filePath ? path.relative(root, filePath).replaceAll("\\", "/") : undefined;
}

function appendExecutorTrace(
  root: string,
  traceId: string,
  executorName: AgentExecutorName,
  executorResult: AgentExecutorResult,
  loopIndex: number,
  warnings: string[] = []
): void {
  const marker = `orchestrator:${loopIndex}:executor`;
  if (traceContainsMarker(root, traceId, marker)) return;
  appendExecutionTraceStep(root, traceId, {
    agent: executorName,
    action: "agent-execute",
    files: executorResult.changedFiles,
    command: executorResult.command,
    reason: `Loop ${loopIndex}: ${executorName} executor returned exit code ${executorResult.exitCode ?? "unknown"}. [${marker}]`,
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

function appendAgentEventsToTrace(root: string, traceId: string, executorName: AgentExecutorName, events: AgentEvent[], loopIndex: number): void {
  for (const [eventIndex, event] of events.entries()) {
    const marker = `orchestrator:${loopIndex}:event:${eventIndex}`;
    if (traceContainsMarker(root, traceId, marker)) continue;
    if (event.type === "message") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "message",
        reason: `${event.role} [${marker}]`,
        output: event.text,
        evidenceSource: "manual"
      });
    } else if (event.type === "tool_call") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "tool-call",
        reason: `${event.tool} [${marker}]`,
        output: safeStringify(event.args),
        evidenceSource: "manual"
      });
    } else if (event.type === "file_read") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "file-read",
        files: [event.path],
        reason: `[${marker}]`,
        evidenceSource: "manual"
      });
    } else if (event.type === "file_edit") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: "edit",
        files: [event.path],
        reason: `[${marker}]`,
        evidenceSource: "manual"
      });
    } else if (event.type === "command_run" || event.type === "test_run") {
      appendExecutionTraceStep(root, traceId, {
        at: event.ts,
        agent: executorName,
        action: event.type === "test_run" ? "run-test" : "run-command",
        command: event.command,
        reason: `[${marker}]`,
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
        reason: `[${marker}]`,
        result: "failed",
        output: event.message,
        evidenceSource: "manual"
      });
    }
  }
}

function traceContainsMarker(root: string, traceId: string, marker: string): boolean {
  return readExecutionTrace(root, traceId)?.steps.some((step) => step.reason?.includes(`[${marker}]`)) ?? false;
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

function mirrorTraceForEvaluation(hostRoot: string, evaluationRoot: string, traceId: string): void {
  if (path.resolve(hostRoot) === path.resolve(evaluationRoot)) return;
  const trace = readExecutionTrace(hostRoot, traceId);
  if (!trace) return;
  const traceDir = path.join(evaluationRoot, ".agent-context", "traces");
  mkdirSync(traceDir, { recursive: true });
  writeFileSync(path.join(traceDir, `${traceId}.json`), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}

function write(filePath: string, content: string): string {
  writeFileSync(filePath, `${content.trim()}\n`, "utf8");
  return filePath;
}

function summarizeOutput(stdout: string, stderr: string, warnings: string[] = []): string {
  const combined = [stdout.trim(), stderr.trim(), ...warnings.map((warning) => `normalizer warning: ${warning}`)].filter(Boolean).join("\n--- stderr ---\n");
  if (!combined) return "";
  return combined.length > 2000 ? `${combined.slice(0, 2000)}\n... truncated ...` : combined;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
