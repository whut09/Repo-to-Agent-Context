import { readJsonDiagnostic, updateJsonAtomic } from "../core/atomic-store.js";
import path from "node:path";
import { hashContextText } from "./hash.js";
import { createContextFeedback, type CreateContextFeedbackInput } from "./feedback.js";
import type { ContextFeedback, ContextFeedbackStore } from "./types.js";

const FEEDBACK_DIRECTORY = path.join(".agent-context", "context-registry", "feedback");

export function contextFeedbackStorePath(repository: string): string {
  const root = normalizeRepository(repository);
  return path.join(root, FEEDBACK_DIRECTORY, `${hashContextText(root.toLowerCase()).slice(0, 32)}.json`);
}

export function recordContextFeedback(input: CreateContextFeedbackInput): ContextFeedback {
  const root = normalizeRepository(input.repository);
  const feedback = createContextFeedback({ ...input, repository: root });
  let result = feedback;
  updateJsonAtomic<ContextFeedbackStore>(contextFeedbackStorePath(root), (current) => {
    const store = current ?? emptyStore(root);
    validateFeedbackStore(store, root);
    const existing = store.feedback.find((item) => item.feedbackId === feedback.feedbackId);
    if (existing) {
      result = existing;
      return store;
    }
    result = feedback;
    return {
      ...store,
      revision: store.revision + 1,
      feedback: [...store.feedback, feedback].sort(compareFeedback)
    };
  });
  return result;
}

export function readContextFeedback(repository: string): ContextFeedback[] {
  return readContextFeedbackStore(repository).feedback;
}

export function readContextFeedbackStore(repository: string): ContextFeedbackStore {
  const root = normalizeRepository(repository);
  const filePath = contextFeedbackStorePath(root);
  const result = readJsonDiagnostic<ContextFeedbackStore>(filePath);
  if (result.status === "missing") return emptyStore(root);
  if (result.status === "corrupt") throw new Error(`Unable to read Context feedback store ${filePath}: ${result.error}`);
  validateFeedbackStore(result.value, root);
  return {
    ...result.value,
    feedback: [...result.value.feedback].sort(compareFeedback)
  };
}

function emptyStore(repository: string): ContextFeedbackStore {
  return { schemaVersion: 1, revision: 0, repository, feedback: [] };
}

function validateFeedbackStore(store: ContextFeedbackStore, repository: string): void {
  if (store.schemaVersion !== 1) throw new Error(`Unsupported Context feedback schemaVersion ${String(store.schemaVersion)}.`);
  if (!Number.isInteger(store.revision) || store.revision < 0) throw new Error("Context feedback store revision must be non-negative.");
  if (path.resolve(store.repository) !== repository) throw new Error("Context feedback store repository does not match the current repository.");
  if (!Array.isArray(store.feedback)) throw new Error("Context feedback store feedback must be an array.");
  const ids = new Set<string>();
  for (const item of store.feedback) {
    if (!item || item.schemaVersion !== 1 || typeof item.feedbackId !== "string") throw new Error("Context feedback store contains an invalid feedback record.");
    if (ids.has(item.feedbackId)) throw new Error(`Context feedback store contains duplicate feedbackId ${item.feedbackId}.`);
    ids.add(item.feedbackId);
  }
}

function compareFeedback(left: ContextFeedback, right: ContextFeedback): number {
  return left.createdAt.localeCompare(right.createdAt) || left.feedbackId.localeCompare(right.feedbackId);
}

function normalizeRepository(repository: string): string {
  if (!repository.trim()) throw new Error("Context feedback repository must not be empty.");
  return path.resolve(repository);
}
