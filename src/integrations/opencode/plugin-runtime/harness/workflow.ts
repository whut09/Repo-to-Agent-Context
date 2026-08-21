import { readJsonDiagnostic, writeJsonAtomic } from "../../../../core/atomic-store.js";
import { hashText } from "../evidence.js";
import { currentSidecarWorkingTreeHash } from "../worktree-hash.js";
import type { PluginWorkflowState } from "./types.js";
import path from "node:path";

export function workflowStatePath(root: string, sessionId: string): string {
  return path.join(root, ".agent-context", "sidecar", `plugin-workflow-${hashText(sessionId).slice(0, 16)}.json`);
}

export function readWorkflowState(root: string, sessionId: string): PluginWorkflowState | undefined {
  const result = readJsonDiagnostic<PluginWorkflowState>(workflowStatePath(root, sessionId));
  return result.status === "ok" ? result.value : undefined;
}

export function initializeWorkflowState(root: string, sessionId: string): PluginWorkflowState {
  const current = currentSidecarWorkingTreeHash(root);
  const existing = readWorkflowState(root, sessionId);
  if (existing) return existing;
  const state: PluginWorkflowState = {
    sessionId,
    phase: "created",
    taskId: null,
    contextFingerprint: null,
    initialWorkingTreeHash: current,
    currentWorkingTreeHash: current,
    editBoundary: { allowedEditGlobs: [], avoidEditGlobs: [] },
    requiredTests: [],
    lastEventKey: null,
    sourceChanged: false,
    updatedAt: new Date().toISOString()
  };
  writeJsonAtomic(workflowStatePath(root, sessionId), state);
  return state;
}

export function updateWorkflowState(root: string, sessionId: string, update: Partial<PluginWorkflowState> & { eventKey?: string }): PluginWorkflowState {
  const state = initializeWorkflowState(root, sessionId);
  const current = currentSidecarWorkingTreeHash(root);
  if (update.eventKey && update.eventKey === state.lastEventKey) return state;
  const next: PluginWorkflowState = {
    ...state,
    ...update,
    currentWorkingTreeHash: current,
    sourceChanged: state.sourceChanged || current !== state.initialWorkingTreeHash,
    lastEventKey: update.eventKey ?? state.lastEventKey,
    updatedAt: new Date().toISOString()
  };
  writeJsonAtomic(workflowStatePath(root, sessionId), next);
  return next;
}

export function contextFingerprint(root: string, taskId: string): string {
  return hashText(`${path.resolve(root)}:${taskId}`);
}
