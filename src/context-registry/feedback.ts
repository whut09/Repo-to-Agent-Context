import path from "node:path";
import { hashContextText } from "./hash.js";
import type { ContextFeedback, ContextFeedbackLabel, ContextFeedbackTarget } from "./types.js";

export const CONTEXT_FEEDBACK_LABELS: readonly ContextFeedbackLabel[] = [
  "useful",
  "not-useful",
  "outdated",
  "inaccurate",
  "incomplete",
  "wrong-version",
  "wrong-example",
  "irrelevant"
] as const;

export const CONTEXT_FEEDBACK_TARGETS: readonly ContextFeedbackTarget[] = ["entry", "file", "retrieval-result", "intervention"] as const;

export interface CreateContextFeedbackInput {
  repository: string;
  entryId: string;
  source: string;
  version?: string;
  revision: number;
  target: ContextFeedbackTarget;
  file?: string;
  retrievalId?: string;
  interventionId?: string;
  label: ContextFeedbackLabel;
  feedbackId?: string;
  now?: Date;
}

export function createContextFeedback(input: CreateContextFeedbackInput): ContextFeedback {
  const repository = path.resolve(requireNonEmpty(input.repository, "repository"));
  const entryId = safeMetadata(input.entryId, "entryId");
  const source = safeMetadata(input.source, "source");
  const version = input.version === undefined ? undefined : safeMetadata(input.version, "version");
  const file = input.file === undefined ? undefined : safeRelativeFile(input.file);
  const retrievalId = input.retrievalId === undefined ? undefined : safeIdentifier(input.retrievalId, "retrievalId");
  const interventionId = input.interventionId === undefined ? undefined : safeIdentifier(input.interventionId, "interventionId");
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new Error("Feedback revision must be a non-negative integer.");
  if (!CONTEXT_FEEDBACK_TARGETS.includes(input.target)) throw new Error(`Unsupported feedback target: ${input.target}`);
  if (!CONTEXT_FEEDBACK_LABELS.includes(input.label)) throw new Error(`Unsupported feedback label: ${input.label}`);
  if (input.target === "file" && !file) throw new Error("File feedback requires a relative file path.");
  if (input.target === "retrieval-result" && !retrievalId) throw new Error("Retrieval feedback requires retrievalId.");
  if (input.target === "intervention" && !interventionId) throw new Error("Intervention feedback requires interventionId.");
  const createdAt = (input.now ?? new Date()).toISOString();
  const feedbackId = input.feedbackId ? safeIdentifier(input.feedbackId, "feedbackId") : feedbackIdFor({ ...input, entryId, source, version, file });
  return {
    schemaVersion: 1,
    feedbackId,
    createdAt,
    target: input.target,
    entryId,
    source,
    ...(version ? { version } : {}),
    revision: input.revision,
    ...(file ? { file } : {}),
    ...(retrievalId ? { retrievalId } : {}),
    ...(interventionId ? { interventionId } : {}),
    label: input.label
  };
}

export function feedbackIdFor(
  input: Pick<CreateContextFeedbackInput, "entryId" | "source" | "version" | "revision" | "target" | "file" | "retrievalId" | "interventionId" | "label"> & {
    repository?: string;
  }
): string {
  return `feedback-${hashContextText(
    [
      input.entryId,
      input.source,
      input.version ?? "",
      String(input.revision),
      input.target,
      input.file ?? "",
      input.retrievalId ?? "",
      input.interventionId ?? "",
      input.label
    ].join("\n")
  ).slice(0, 24)}`;
}

export function safeRelativeFile(value: string): string {
  const normalized = requireNonEmpty(value, "file");
  if (normalized.includes("\\") || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized)) {
    throw new Error("Feedback file must be a repository-relative path.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("Feedback file must not contain path traversal.");
  return parts.join("/");
}

function safeIdentifier(value: string, field: string): string {
  const result = safeMetadata(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(result)) throw new Error(`Feedback ${field} contains unsupported characters.`);
  return result;
}

function safeMetadata(value: string, field: string): string {
  const result = requireNonEmpty(value, field);
  if (result.length > 500) throw new Error(`Feedback ${field} is too long.`);
  if (/[\u0000-\u001f\u007f]/.test(result)) throw new Error(`Feedback ${field} contains control characters.`);
  if (/(?:api[_-]?key|authorization|password|secret|token)\s*[:=]/i.test(result) || /(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}/i.test(result)) {
    throw new Error(`Feedback ${field} looks like a secret and was rejected.`);
  }
  return result.trim();
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Feedback ${field} must not be empty.`);
  return value.trim();
}
