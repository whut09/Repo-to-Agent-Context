import { existsSync } from "node:fs";
import path from "node:path";
import { readJsonFile } from "../../core/json-store.js";
import { writeJsonAtomicWithRevision } from "../../core/atomic-store.js";
import type { HarnessDecision } from "../types.js";
import type { ConvergenceResult } from "./convergence.js";

export const ORCHESTRATOR_STATE_SCHEMA_VERSION = "opencode-plusplus.orchestrator-state.v1";

export type OrchestratorPhase = "plan" | "prepare-sandbox" | "execute" | "collect" | "evaluate" | "decide" | "persist" | "finalize" | "completed";

export interface OrchestratorRunState {
  schemaVersion: typeof ORCHESTRATOR_STATE_SCHEMA_VERSION;
  revision?: number;
  runId: string;
  task: string;
  repo: string;
  currentPhase: OrchestratorPhase;
  currentIteration: number;
  completedPhases: string[];
  executorResultReference?: string;
  traceReference: string;
  contextFingerprint: string;
  workingTreeHash: string;
  latestDecision?: HarnessDecision;
  convergence?: ConvergenceResult;
  evaluationReference?: string;
  iterationReference?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export class OrchestratorStateRepository {
  constructor(private readonly root: string) {}

  pathFor(runId: string): string {
    return path.join(this.root, ".agent-context", "orchestrator", runId, "state.json");
  }

  load(runId: string): OrchestratorRunState | null {
    const filePath = this.pathFor(runId);
    if (!existsSync(filePath)) return null;
    const parsed = readJsonFile<Partial<OrchestratorRunState>>(filePath);
    if (!parsed) return null;
    if (parsed.schemaVersion !== ORCHESTRATOR_STATE_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported orchestrator state schemaVersion "${String(parsed.schemaVersion)}" for run ${runId}; expected ${ORCHESTRATOR_STATE_SCHEMA_VERSION}.`
      );
    }
    return parsed as OrchestratorRunState;
  }

  create(input: {
    runId: string;
    task: string;
    repo: string;
    traceReference: string;
    contextFingerprint: string;
    workingTreeHash: string;
  }): OrchestratorRunState {
    const now = new Date().toISOString();
    return {
      schemaVersion: ORCHESTRATOR_STATE_SCHEMA_VERSION,
      revision: 0,
      runId: input.runId,
      task: input.task,
      repo: input.repo,
      currentPhase: "plan",
      currentIteration: 1,
      completedPhases: [],
      traceReference: input.traceReference,
      contextFingerprint: input.contextFingerprint,
      workingTreeHash: input.workingTreeHash,
      createdAt: now,
      updatedAt: now
    };
  }

  save(state: OrchestratorRunState): OrchestratorRunState {
    const filePath = this.pathFor(state.runId);
    const next = { ...state, updatedAt: new Date().toISOString() };
    return writeJsonAtomicWithRevision(filePath, next, state.revision ?? 0);
  }
}

export function phaseKey(iteration: number, phase: OrchestratorPhase): string {
  return `${String(iteration).padStart(3, "0")}:${phase}`;
}

export function completePhase(
  state: OrchestratorRunState,
  phase: OrchestratorPhase,
  nextPhase: OrchestratorPhase,
  updates: Partial<Omit<OrchestratorRunState, "schemaVersion" | "runId" | "createdAt">> = {}
): OrchestratorRunState {
  const key = phaseKey(state.currentIteration, phase);
  return {
    ...state,
    ...updates,
    currentPhase: nextPhase,
    completedPhases: state.completedPhases.includes(key) ? state.completedPhases : [...state.completedPhases, key]
  };
}

export function phaseCompleted(state: OrchestratorRunState, iteration: number, phase: OrchestratorPhase): boolean {
  return state.completedPhases.includes(phaseKey(iteration, phase));
}

export class OrchestratorInterruptedError extends Error {
  constructor(
    readonly runId: string,
    readonly phase: OrchestratorPhase
  ) {
    super(`Orchestrator run ${runId} interrupted after ${phase}; resume with run-id ${runId}.`);
  }
}
