import { createHash } from "node:crypto";
import path from "node:path";
import { readJsonDiagnostic, writeJsonAtomicWithRevision } from "../core/atomic-store.js";
import type { ContextPackage } from "../core/types.js";
import { runGit } from "../core/git.js";

export type RunState =
  | "EMPTY"
  | "CONTEXT_READY"
  | "TASK_PACK_READY"
  | "EDIT_BOUNDARY_READY"
  | "AGENT_STARTED"
  | "EDITED"
  | "VERIFYING"
  | "REPAIRING"
  | "READY_FOR_REVIEW"
  | "BLOCKED";

export type RuntimeActionType =
  | "build_context"
  | "prepare_task_pack"
  | "prepare_edit_boundary"
  | "start_agent"
  | "run_tests"
  | "repair_contracts"
  | "expand_context"
  | "replan"
  | "review"
  | "blocked";

export interface RuntimeNextAction {
  type: RuntimeActionType;
  blocking: boolean;
  reason: string;
  command?: string;
  expectedEvidence: string[];
}

export interface RunStateSnapshot {
  schemaVersion?: 1;
  revision?: number;
  state: RunState;
  previousState?: RunState;
  taskId: string;
  task: string;
  phase: string;
  repoHash: string;
  contextHash: string;
  diffHash: string;
  updatedAt: string;
  lastAction: string;
  allowedActions: RuntimeActionType[];
  nextAction: RuntimeNextAction;
  satisfiedEvidence: string[];
  missingEvidence: string[];
  transitionReason: string;
}

export interface RuntimeStateInput {
  taskId: string;
  task: string;
  phase: string;
  contextFresh: boolean;
  driftClean: boolean;
  taskPackReady: boolean;
  editBoundaryReady: boolean;
  changedFiles: string[];
  contractsPassed: boolean;
  contractViolations: number;
  taskPackOverBudget: boolean;
  impactRisk: "Low" | "Medium" | "High";
  passedTestEvidence: "none" | "manual" | "command" | "ci";
  decisions: Array<{
    action: string;
    blocking: boolean;
    command?: string;
    reason: string;
  }>;
}

export function readRunState(root: string, taskId: string): RunStateSnapshot | null {
  const filePath = runStatePath(root, taskId);
  const result = readJsonDiagnostic<RunStateSnapshot>(filePath);
  if (result.status === "missing") return null;
  if (result.status === "corrupt") throw new Error(`Unable to read runtime state ${taskId}: ${result.error}`);
  return { ...result.value, schemaVersion: result.value.schemaVersion ?? 1, revision: result.value.revision ?? 0 };
}

export function writeRunState(root: string, snapshot: RunStateSnapshot): string {
  const filePath = runStatePath(root, snapshot.taskId);
  const persisted = writeJsonAtomicWithRevision(filePath, { ...snapshot, schemaVersion: 1 }, snapshot.revision ?? 0);
  snapshot.schemaVersion = 1;
  snapshot.revision = persisted.revision;
  return filePath;
}

export function runStatePath(root: string, taskId: string): string {
  return path.join(root, ".agent-context", "runs", taskId, "state.json");
}

export function initialRunState(context: ContextPackage, taskId: string, task: string, phase = "preflight"): RunStateSnapshot {
  return buildRunStateSnapshot(context, {
    taskId,
    task,
    phase,
    contextFresh: true,
    driftClean: true,
    taskPackReady: true,
    editBoundaryReady: true,
    changedFiles: [],
    contractsPassed: true,
    contractViolations: 0,
    taskPackOverBudget: false,
    impactRisk: "Low",
    passedTestEvidence: "none",
    decisions: [
      {
        action: "start-agent",
        blocking: false,
        reason: "Task pack and edit boundary are ready; agent execution can start."
      }
    ]
  });
}

export function buildRunStateSnapshot(context: ContextPackage, input: RuntimeStateInput): RunStateSnapshot {
  const previous = readRunState(context.scan.root, input.taskId);
  const evidence = evidenceFor(input);
  const nextAction = nextActionFor(input);
  const state = stateFor(input, nextAction);
  return {
    schemaVersion: 1,
    revision: previous?.revision ?? 0,
    state,
    ...(previous?.state ? { previousState: previous.state } : {}),
    taskId: input.taskId,
    task: input.task,
    phase: input.phase,
    repoHash: repoHash(context),
    contextHash: contextHash(input),
    diffHash: diffHash(context, input.changedFiles),
    updatedAt: new Date().toISOString(),
    lastAction: lastActionFor(input),
    allowedActions: allowedActionsFor(state),
    nextAction,
    satisfiedEvidence: evidence.satisfied,
    missingEvidence: evidence.missing,
    transitionReason: transitionReasonFor(state, nextAction, previous?.state)
  };
}

function stateFor(input: RuntimeStateInput, nextAction: RuntimeNextAction): RunState {
  if (!input.contextFresh || !input.driftClean) return "BLOCKED";
  if (input.taskPackOverBudget) return "BLOCKED";
  if (!input.taskPackReady) return "CONTEXT_READY";
  if (!input.editBoundaryReady) return "TASK_PACK_READY";
  if (!input.changedFiles.length && input.phase === "preflight") return "EDIT_BOUNDARY_READY";
  if (input.contractViolations > 0 || !input.contractsPassed) return "REPAIRING";
  if (input.changedFiles.length && input.passedTestEvidence === "none") return nextAction.type === "run_tests" ? "EDITED" : "VERIFYING";
  if (input.impactRisk === "High") return "VERIFYING";
  if (input.changedFiles.length && input.passedTestEvidence !== "none") return "READY_FOR_REVIEW";
  return "EDIT_BOUNDARY_READY";
}

function nextActionFor(input: RuntimeStateInput): RuntimeNextAction {
  const blockingDecision = input.decisions.find((decision) => decision.blocking);
  const firstDecision = blockingDecision ?? input.decisions[0];
  if (!firstDecision) {
    return {
      type: "blocked",
      blocking: true,
      reason: "No loop decision was produced.",
      expectedEvidence: []
    };
  }

  const type = actionTypeFor(firstDecision.action);
  return {
    type,
    blocking: firstDecision.blocking,
    reason: firstDecision.reason,
    ...(firstDecision.command ? { command: firstDecision.command } : {}),
    expectedEvidence: expectedEvidenceFor(type)
  };
}

function actionTypeFor(action: string): RuntimeActionType {
  if (action === "rebuild-context") return "build_context";
  if (action === "replan") return "replan";
  if (action === "expand-context") return "expand_context";
  if (action === "repair-contracts") return "repair_contracts";
  if (action === "add-or-update-tests" || action === "run-tests") return "run_tests";
  if (action === "ready-for-review") return "review";
  if (action === "start-agent") return "start_agent";
  return "blocked";
}

function expectedEvidenceFor(action: RuntimeActionType): string[] {
  if (action === "build_context") return ["context_fresh", "drift_clean"];
  if (action === "replan") return ["task_pack_within_budget"];
  if (action === "expand_context") return ["expanded_context_reviewed"];
  if (action === "repair_contracts") return ["contracts_valid"];
  if (action === "run_tests") return ["required_tests_passed"];
  if (action === "start_agent") return ["agent_started", "execution_trace_created"];
  if (action === "review") return ["final_review_complete"];
  if (action === "prepare_task_pack") return ["task_pack_ready"];
  if (action === "prepare_edit_boundary") return ["edit_boundary_ready"];
  return [];
}

function evidenceFor(input: RuntimeStateInput): { satisfied: string[]; missing: string[] } {
  const satisfied: string[] = [];
  const missing: string[] = [];

  pushEvidence(input.contextFresh, "context_fresh", satisfied, missing);
  pushEvidence(input.driftClean, "drift_clean", satisfied, missing);
  pushEvidence(input.taskPackReady, "task_pack_ready", satisfied, missing);
  pushEvidence(input.editBoundaryReady, "edit_boundary_ready", satisfied, missing);
  pushEvidence(!input.taskPackOverBudget, "task_pack_within_budget", satisfied, missing);
  pushEvidence(input.contractsPassed && input.contractViolations === 0, "contracts_valid", satisfied, missing);
  if (input.changedFiles.length) {
    pushEvidence(input.passedTestEvidence !== "none", "required_tests_passed", satisfied, missing);
    satisfied.push("working_tree_changed");
  } else {
    missing.push("agent_edit");
  }

  if (input.passedTestEvidence !== "none") {
    satisfied.push(`test_evidence_${input.passedTestEvidence}`);
  }

  return { satisfied: unique(satisfied), missing: unique(missing) };
}

function pushEvidence(condition: boolean, name: string, satisfied: string[], missing: string[]): void {
  if (condition) {
    satisfied.push(name);
  } else {
    missing.push(name);
  }
}

function lastActionFor(input: RuntimeStateInput): string {
  if (input.phase === "preflight") return "preflight";
  if (input.contractViolations > 0 || !input.contractsPassed) return "contract_check_failed";
  if (input.changedFiles.length && input.passedTestEvidence === "none") return "agent_edit";
  if (input.changedFiles.length && input.passedTestEvidence !== "none") return "verification_passed";
  return "loop_step";
}

function allowedActionsFor(state: RunState): RuntimeActionType[] {
  if (state === "EMPTY") return ["build_context"];
  if (state === "CONTEXT_READY") return ["prepare_task_pack"];
  if (state === "TASK_PACK_READY") return ["prepare_edit_boundary"];
  if (state === "EDIT_BOUNDARY_READY") return ["start_agent", "replan"];
  if (state === "AGENT_STARTED") return ["run_tests", "replan"];
  if (state === "EDITED") return ["run_tests", "repair_contracts"];
  if (state === "VERIFYING") return ["run_tests", "expand_context", "repair_contracts"];
  if (state === "REPAIRING") return ["repair_contracts", "run_tests"];
  if (state === "READY_FOR_REVIEW") return ["review"];
  return ["build_context", "replan"];
}

function transitionReasonFor(state: RunState, nextAction: RuntimeNextAction, previous?: RunState): string {
  const prefix = previous && previous !== state ? `${previous} -> ${state}` : `state ${state}`;
  return `${prefix}: next action is ${nextAction.type} because ${nextAction.reason}`;
}

function repoHash(context: ContextPackage): string {
  const commit = safeGit(context.scan.root, ["rev-parse", "HEAD"]).trim();
  const status = safeGit(context.scan.root, ["status", "--porcelain", "--untracked-files=all"]);
  return hashValue({ commit, status });
}

function contextHash(input: RuntimeStateInput): string {
  return hashValue({
    contextFresh: input.contextFresh,
    driftClean: input.driftClean,
    taskPackReady: input.taskPackReady,
    editBoundaryReady: input.editBoundaryReady,
    taskPackOverBudget: input.taskPackOverBudget
  });
}

function diffHash(context: ContextPackage, changedFiles: string[]): string {
  const diff = safeGit(context.scan.root, ["diff", "--", ...changedFiles]);
  return hashValue({ changedFiles, diff });
}

function safeGit(root: string, args: string[]): string {
  try {
    return runGit(root, args);
  } catch {
    return "";
  }
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
