import {
  invalidResult,
  isRecord,
  optionalString,
  requiredPositiveInteger,
  requiredString,
  requiredStringArray,
  validateSchemaEnvelope,
  validResult,
  type ContextValidationResult,
  type ContextSchemaIssue
} from "./schema.js";
import { hashContextText } from "./hash.js";
import type {
  ContextAnnotation,
  ContextAnnotationKind,
  ContextAnnotationStore,
  ContextEntry,
  ContextEntryKind,
  ContextFetchResult,
  ContextFeedback,
  ContextFeedbackLabel,
  ContextFeedbackStore,
  ContextFeedbackTarget,
  ContextFile,
  ContextFileRole,
  ContextPack,
  ContextProvenance,
  ContextSource,
  ContextTrustLevel
} from "./types.js";

const FILE_ROLES = new Set<ContextFileRole>(["entry", "reference", "example", "error", "other"]);
const SOURCE_KINDS = new Set(["local", "remote", "bundled"]);
const TRUST_LEVELS = new Set<ContextTrustLevel>(["official", "maintainer", "community", "private", "untrusted"]);
const ENTRY_KINDS = new Set<ContextEntryKind>(["doc", "skill", "reference", "task-pack", "repository"]);
const ANNOTATION_KINDS = new Set<ContextAnnotationKind>(["environment", "version-difference", "failure-cause", "convention", "workaround"]);
const FEEDBACK_LABELS = new Set<ContextFeedbackLabel>(["useful", "not-useful", "outdated", "inaccurate", "incomplete", "wrong-version", "wrong-example", "irrelevant"]);
const FEEDBACK_TARGETS = new Set<ContextFeedbackTarget>(["entry", "file", "retrieval-result", "intervention"]);

export function validateContextFeedback(input: unknown, path = "$"): ContextValidationResult<ContextFeedback> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  requiredString(input, "feedbackId", path, issues);
  requiredTimestamp(input, "createdAt", path, issues);
  const target = requiredString(input, "target", path, issues);
  const label = requiredString(input, "label", path, issues);
  requiredString(input, "entryId", path, issues);
  requiredString(input, "source", path, issues);
  optionalString(input, "version", path, issues);
  const file = optionalString(input, "file", path, issues);
  const retrievalId = optionalString(input, "retrievalId", path, issues);
  const interventionId = optionalString(input, "interventionId", path, issues);
  if (target && !FEEDBACK_TARGETS.has(target as ContextFeedbackTarget)) issues.push({ path: `${path}.target`, code: "value", message: `unsupported feedback target ${target}` });
  if (label && !FEEDBACK_LABELS.has(label as ContextFeedbackLabel)) issues.push({ path: `${path}.label`, code: "value", message: `unsupported feedback label ${label}` });
  if (file && !normalizeContextFilePath(file)) issues.push({ path: `${path}.file`, code: "path", message: "must be a normalized relative path" });
  if (target === "file" && !file) issues.push({ path: `${path}.file`, code: "required", message: "file feedback requires file" });
  if (target === "retrieval-result" && !retrievalId) issues.push({ path: `${path}.retrievalId`, code: "required", message: "retrieval feedback requires retrievalId" });
  if (target === "intervention" && !interventionId) issues.push({ path: `${path}.interventionId`, code: "required", message: "intervention feedback requires interventionId" });
  return issues.length ? invalidResult(issues) : validResult(input as unknown as ContextFeedback);
}

export function validateContextFeedbackStore(input: unknown, path = "$"): ContextValidationResult<ContextFeedbackStore> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  requiredString(input, "repository", path, issues);
  if (!Array.isArray(input.feedback)) issues.push({ path: `${path}.feedback`, code: "type", message: "expected an array" });
  const ids = new Set<string>();
  for (const [index, item] of (Array.isArray(input.feedback) ? input.feedback : []).entries()) {
    const result = validateContextFeedback(item, `${path}.feedback[${index}]`);
    issues.push(...result.issues);
    if (result.value) {
      if (ids.has(result.value.feedbackId)) issues.push({ path: `${path}.feedback[${index}].feedbackId`, code: "value", message: "feedback IDs must be unique" });
      ids.add(result.value.feedbackId);
    }
  }
  return issues.length ? invalidResult(issues) : validResult(input as unknown as ContextFeedbackStore);
}

export function validateContextFile(input: unknown, path = "$"): ContextValidationResult<ContextFile> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const role = requiredString(input, "role", path, issues);
  if (role && !FILE_ROLES.has(role as ContextFileRole)) issues.push({ path: `${path}.role`, code: "value", message: `unsupported file role ${role}` });
  const contentHash = requiredHash(input, "contentHash", path, issues);
  const sizeBytes = requiredNonNegativeInteger(input, "sizeBytes", path, issues);
  const updatedAt = requiredTimestamp(input, "updatedAt", path, issues);
  const filePath = requiredString(input, "path", path, issues);
  if (filePath?.includes("..") || filePath?.startsWith("/") || filePath?.includes("\\")) {
    issues.push({ path: `${path}.path`, code: "format", message: "must be a normalized relative path" });
  }
  if (issues.length) return invalidResult(issues);
  return validResult({ ...input, role, contentHash, sizeBytes, updatedAt, path: filePath } as ContextFile);
}

export function validateContextSource(input: unknown, path = "$"): ContextValidationResult<ContextSource> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const name = requiredString(input, "name", path, issues);
  const kind = requiredString(input, "kind", path, issues);
  const location = requiredString(input, "location", path, issues);
  const trustLevel = requiredString(input, "trustLevel", path, issues);
  const enabled = input.enabled;
  if (kind && !SOURCE_KINDS.has(kind)) issues.push({ path: `${path}.kind`, code: "value", message: `unsupported source kind ${kind}` });
  if (trustLevel && !TRUST_LEVELS.has(trustLevel as ContextTrustLevel)) {
    issues.push({ path: `${path}.trustLevel`, code: "value", message: `unsupported trust level ${trustLevel}` });
  }
  if (typeof enabled !== "boolean") issues.push({ path: `${path}.enabled`, code: "type", message: "expected a boolean" });
  const registryHash = optionalString(input, "registryHash", path, issues);
  const fetchedAt = optionalString(input, "fetchedAt", path, issues);
  const updatedAt = requiredTimestamp(input, "updatedAt", path, issues);
  if (issues.length) return invalidResult(issues);
  return validResult({ ...input, name, kind, location, trustLevel, enabled, registryHash, fetchedAt, updatedAt } as ContextSource);
}

export function validateContextProvenance(input: unknown, path = "$"): ContextValidationResult<ContextProvenance> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const sourceName = requiredString(input, "sourceName", path, issues);
  const sourceTrustLevel = requiredString(input, "sourceTrustLevel", path, issues);
  const entryId = requiredString(input, "entryId", path, issues);
  const packageVersion = optionalString(input, "packageVersion", path, issues);
  const contentRevision = requiredPositiveInteger(input, "contentRevision", path, issues);
  const contentHash = requiredHash(input, "contentHash", path, issues);
  const fetchedAt = optionalString(input, "fetchedAt", path, issues);
  const verified = input.verified;
  if (sourceTrustLevel && !TRUST_LEVELS.has(sourceTrustLevel as ContextTrustLevel)) {
    issues.push({ path: `${path}.sourceTrustLevel`, code: "value", message: `unsupported trust level ${sourceTrustLevel}` });
  }
  if (typeof verified !== "boolean") issues.push({ path: `${path}.verified`, code: "type", message: "expected a boolean" });
  if (issues.length) return invalidResult(issues);
  return validResult({
    ...input,
    sourceName,
    sourceTrustLevel,
    entryId,
    packageVersion,
    contentRevision,
    contentHash,
    fetchedAt,
    verified
  } as ContextProvenance);
}

export function validateContextAnnotation(input: unknown, path = "$"): ContextValidationResult<ContextAnnotation> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const id = requiredString(input, "id", path, issues);
  const repository = requiredString(input, "repository", path, issues);
  const entryId = requiredString(input, "entryId", path, issues);
  const packageVersion = optionalString(input, "packageVersion", path, issues);
  const contentRevision = requiredPositiveInteger(input, "contentRevision", path, issues);
  const note = requiredString(input, "note", path, issues);
  const trustLevel = requiredString(input, "trustLevel", path, issues);
  const createdAt = requiredTimestamp(input, "createdAt", path, issues);
  const updatedAt = requiredTimestamp(input, "updatedAt", path, issues);
  if (trustLevel !== "untrusted") issues.push({ path: `${path}.trustLevel`, code: "value", message: "annotations must be marked untrusted" });
  if (issues.length) return invalidResult(issues);
  return validResult({
    ...input,
    id,
    repository,
    entryId,
    packageVersion,
    contentRevision,
    note,
    trustLevel: "untrusted",
    createdAt,
    updatedAt
  } as ContextAnnotation);
}

export function validateLocalContextAnnotation(input: unknown, path = "$"): ContextValidationResult<import("./types.js").LocalContextAnnotation> {
  const base = validateContextAnnotation(input, path);
  const issues = [...(base.valid ? [] : base.issues)];
  if (!isRecord(input)) return invalidResult(issues);
  const kind = requiredString(input, "kind", path, issues);
  const author = requiredString(input, "author", path, issues);
  if (kind && !ANNOTATION_KINDS.has(kind as ContextAnnotationKind)) {
    issues.push({ path: `${path}.kind`, code: "value", message: `unsupported annotation kind ${kind}` });
  }
  if (author !== "user" && author !== "agent") issues.push({ path: `${path}.author`, code: "value", message: "expected user or agent" });
  if (issues.length || !base.valid) return invalidResult(issues);
  return validResult({ ...base.value!, kind: kind as ContextAnnotationKind, author: author as "user" | "agent" });
}

export function validateContextAnnotationStore(input: unknown, path = "$"): ContextValidationResult<ContextAnnotationStore> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const repository = requiredString(input, "repository", path, issues);
  const annotationsInput = input.annotations;
  if (!Array.isArray(annotationsInput)) issues.push({ path: `${path}.annotations`, code: "type", message: "expected an array" });
  const annotations: import("./types.js").LocalContextAnnotation[] = [];
  const ids = new Set<string>();
  for (const [index, annotation] of (Array.isArray(annotationsInput) ? annotationsInput : []).entries()) {
    const result = validateLocalContextAnnotation(annotation, `${path}.annotations[${index}]`);
    if (!result.valid) issues.push(...result.issues);
    else {
      if (ids.has(result.value!.id)) issues.push({ path: `${path}.annotations[${index}].id`, code: "value", message: "annotation ids must be unique" });
      ids.add(result.value!.id);
      if (result.value!.repository !== repository)
        issues.push({ path: `${path}.annotations[${index}].repository`, code: "value", message: "must match store repository" });
      annotations.push(result.value!);
    }
  }
  if (issues.length) return invalidResult(issues);
  return validResult({ ...input, repository, annotations } as ContextAnnotationStore);
}

export function validateContextEntry(input: unknown, path = "$"): ContextValidationResult<ContextEntry> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const id = requiredString(input, "id", path, issues);
  const canonicalId = optionalString(input, "canonicalId", path, issues);
  const variantKey = optionalString(input, "variantKey", path, issues);
  const apiVersion = optionalString(input, "apiVersion", path, issues);
  const name = requiredString(input, "name", path, issues);
  const description = requiredString(input, "description", path, issues);
  const kind = requiredString(input, "kind", path, issues);
  const tags = requiredStringArray(input, "tags", path, issues);
  const language = optionalString(input, "language", path, issues);
  const packageVersion = optionalString(input, "packageVersion", path, issues);
  const contentRevision = requiredPositiveInteger(input, "contentRevision", path, issues);
  const updatedAt = requiredTimestamp(input, "updatedAt", path, issues);
  const sourceName = requiredString(input, "sourceName", path, issues);
  const trustLevel = requiredString(input, "trustLevel", path, issues);
  const contentHash = requiredHash(input, "contentHash", path, issues);
  const symbols = optionalStringArray(input, "symbols", path, issues);
  const dependencyChain = optionalStringArray(input, "dependencyChain", path, issues);
  const qualityScore = optionalNonNegativeNumber(input, "qualityScore", path, issues);
  if (kind && !ENTRY_KINDS.has(kind as ContextEntryKind)) issues.push({ path: `${path}.kind`, code: "value", message: `unsupported entry kind ${kind}` });
  if (trustLevel && !TRUST_LEVELS.has(trustLevel as ContextTrustLevel)) {
    issues.push({ path: `${path}.trustLevel`, code: "value", message: `unsupported trust level ${trustLevel}` });
  }
  const filesInput = input.files;
  if (!Array.isArray(filesInput)) {
    issues.push({ path: `${path}.files`, code: "type", message: "expected an array of ContextFile values" });
  }
  const files: ContextFile[] = [];
  for (const [index, file] of (Array.isArray(filesInput) ? filesInput : []).entries()) {
    const result = validateContextFile(file, `${path}.files[${index}]`);
    if (!result.valid) issues.push(...result.issues);
    else files.push(result.value!);
  }
  const provenanceResult = validateContextProvenance(input.provenance, `${path}.provenance`);
  if (!provenanceResult.valid) issues.push(...provenanceResult.issues);
  if (provenanceResult.valid && provenanceResult.value && provenanceResult.value.entryId !== id) {
    issues.push({ path: `${path}.provenance.entryId`, code: "value", message: "must match entry id" });
  }
  if (provenanceResult.valid && provenanceResult.value && provenanceResult.value.contentRevision !== contentRevision) {
    issues.push({ path: `${path}.provenance.contentRevision`, code: "value", message: "must match entry contentRevision" });
  }
  if (issues.length) return invalidResult(issues);
  return validResult({
    ...input,
    id,
    canonicalId,
    variantKey,
    apiVersion,
    name,
    description,
    kind,
    tags: [...new Set(tags)].sort((left, right) => left.localeCompare(right)),
    language,
    packageVersion,
    contentRevision,
    updatedAt,
    sourceName,
    trustLevel,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    contentHash,
    symbols,
    dependencyChain,
    qualityScore,
    provenance: provenanceResult.value!
  } as ContextEntry);
}

export function validateContextPack(input: unknown, path = "$"): ContextValidationResult<ContextPack> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const id = requiredString(input, "id", path, issues);
  const sourceName = requiredString(input, "sourceName", path, issues);
  const generatedAt = requiredTimestamp(input, "generatedAt", path, issues);
  const contentHash = requiredHash(input, "contentHash", path, issues);
  const entriesInput = input.entries;
  if (!Array.isArray(entriesInput)) issues.push({ path: `${path}.entries`, code: "type", message: "expected an array of ContextEntry values" });
  const entries: ContextEntry[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of (Array.isArray(entriesInput) ? entriesInput : []).entries()) {
    const result = validateContextEntry(entry, `${path}.entries[${index}]`);
    if (!result.valid) {
      issues.push(...result.issues);
      continue;
    }
    if (ids.has(result.value!.id)) issues.push({ path: `${path}.entries[${index}].id`, code: "value", message: "entry ids must be unique within a pack" });
    ids.add(result.value!.id);
    if (result.value!.sourceName !== sourceName) {
      issues.push({ path: `${path}.entries[${index}].sourceName`, code: "value", message: "must match pack sourceName" });
    }
    entries.push(result.value!);
  }
  if (issues.length) return invalidResult(issues);
  return validResult({ ...input, id, sourceName, generatedAt, entries, contentHash } as ContextPack);
}

export function validateContextFetchResult(input: unknown, path = "$"): ContextValidationResult<ContextFetchResult> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const selectedFiles = requiredStringArray(input, "selectedFiles", path, issues);
  const omittedFiles = requiredStringArray(input, "omittedFiles", path, issues);
  const overlap = selectedFiles.filter((file) => omittedFiles.includes(file));
  if (overlap.length) issues.push({ path: `${path}.selectedFiles`, code: "value", message: `selected and omitted files overlap: ${overlap.join(", ")}` });
  for (const [name, files] of [
    ["selectedFiles", selectedFiles],
    ["omittedFiles", omittedFiles]
  ] as const) {
    for (const file of files) {
      if (!normalizeContextFilePath(file)) issues.push({ path: `${path}.${name}`, code: "path", message: `must contain normalized relative paths: ${file}` });
    }
  }
  const entryResult = validateContextEntry(input.entry, `${path}.entry`);
  if (!entryResult.valid) issues.push(...entryResult.issues);
  const provenanceResult = validateContextProvenance(input.provenance, `${path}.provenance`);
  if (!provenanceResult.valid) issues.push(...provenanceResult.issues);
  const cache = input.cache;
  if (!isRecord(cache)) {
    issues.push({ path: `${path}.cache`, code: "type", message: "expected a cache object" });
  } else if (cache.status !== "hit" && cache.status !== "miss") {
    issues.push({ path: `${path}.cache.status`, code: "value", message: "expected hit or miss" });
  }
  const contextMode = input.contextMode;
  if (contextMode !== "reused" && contextMode !== "incremental" && contextMode !== "rebuilt") {
    issues.push({ path: `${path}.contextMode`, code: "value", message: "expected reused, incremental, or rebuilt" });
  }
  const fetchMode = input.fetchMode;
  if (fetchMode !== undefined && fetchMode !== "entry" && fetchMode !== "file" && fetchMode !== "full") {
    issues.push({ path: `${path}.fetchMode`, code: "value", message: "expected entry, file, or full" });
  }
  const filesInput = input.files;
  if (filesInput !== undefined && !Array.isArray(filesInput)) issues.push({ path: `${path}.files`, code: "type", message: "expected an array" });
  for (const [index, file] of (Array.isArray(filesInput) ? filesInput : []).entries()) {
    if (!isRecord(file)) {
      issues.push({ path: `${path}.files[${index}]`, code: "type", message: "expected a fetched file object" });
      continue;
    }
    const filePath = requiredString(file, "path", `${path}.files[${index}]`, issues);
    const role = requiredString(file, "role", `${path}.files[${index}]`, issues);
    const content = file.content;
    if (filePath && !normalizeContextFilePath(filePath))
      issues.push({ path: `${path}.files[${index}].path`, code: "path", message: "must be a normalized relative path" });
    if (role && !FILE_ROLES.has(role as ContextFileRole))
      issues.push({ path: `${path}.files[${index}].role`, code: "value", message: `unsupported file role ${role}` });
    if (typeof content !== "string") issues.push({ path: `${path}.files[${index}].content`, code: "type", message: "expected a string" });
    const contentHash = requiredHash(file, "contentHash", `${path}.files[${index}]`, issues);
    if (typeof content === "string" && contentHash && hashContextText(content) !== contentHash) {
      issues.push({ path: `${path}.files[${index}].contentHash`, code: "value", message: "does not match fetched file content" });
    }
  }
  const freshness = input.freshness;
  if (freshness !== undefined) {
    if (!isRecord(freshness)) issues.push({ path: `${path}.freshness`, code: "type", message: "expected a freshness object" });
    else {
      if (freshness.status !== "fresh" && freshness.status !== "stale")
        issues.push({ path: `${path}.freshness.status`, code: "value", message: "expected fresh or stale" });
      requiredString(freshness, "workingTreeHash", `${path}.freshness`, issues);
      requiredTimestamp(freshness, "checkedAt", `${path}.freshness`, issues);
      optionalString(freshness, "reason", `${path}.freshness`, issues);
    }
  }
  const availability = input.annotationAvailability;
  if (availability !== undefined) {
    if (!isRecord(availability)) issues.push({ path: `${path}.annotationAvailability`, code: "type", message: "expected an availability object" });
    else {
      if (typeof availability.annotationAvailable !== "boolean")
        issues.push({ path: `${path}.annotationAvailability.annotationAvailable`, code: "type", message: "expected a boolean" });
      if (!Array.isArray(availability.annotations))
        issues.push({ path: `${path}.annotationAvailability.annotations`, code: "type", message: "expected an array" });
      if (!Number.isInteger(availability.staleCount) || Number(availability.staleCount) < 0)
        issues.push({ path: `${path}.annotationAvailability.staleCount`, code: "value", message: "expected a non-negative integer" });
    }
  }
  const injection = input.annotationInjection;
  if (injection !== undefined) {
    if (!isRecord(injection)) issues.push({ path: `${path}.annotationInjection`, code: "type", message: "expected an injection object" });
    else {
      if (injection.source !== "user-written") issues.push({ path: `${path}.annotationInjection.source`, code: "value", message: "must be user-written" });
      if (injection.trustLevel !== "untrusted") issues.push({ path: `${path}.annotationInjection.trustLevel`, code: "value", message: "must be untrusted" });
      if (injection.role !== "context-only") issues.push({ path: `${path}.annotationInjection.role`, code: "value", message: "must be context-only" });
      if (injection.commandAuthority !== false) issues.push({ path: `${path}.annotationInjection.commandAuthority`, code: "value", message: "must be false" });
      if (injection.evidenceAuthority !== false)
        issues.push({ path: `${path}.annotationInjection.evidenceAuthority`, code: "value", message: "must be false" });
      requiredString(injection, "content", `${path}.annotationInjection`, issues);
    }
  }
  const durationMs = input.durationMs;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    issues.push({ path: `${path}.durationMs`, code: "value", message: "expected a non-negative number" });
  }
  const annotations = input.annotations;
  if (annotations !== undefined && !Array.isArray(annotations)) issues.push({ path: `${path}.annotations`, code: "type", message: "expected an array" });
  for (const [index, annotation] of (Array.isArray(annotations) ? annotations : []).entries()) {
    const result = validateContextAnnotation(annotation, `${path}.annotations[${index}]`);
    if (!result.valid) issues.push(...result.issues);
  }
  if (issues.length) return invalidResult(issues);
  return validResult({ ...input, selectedFiles, omittedFiles, entry: entryResult.value!, provenance: provenanceResult.value! } as ContextFetchResult);
}

function normalizeContextFilePath(value: string): string | undefined {
  if (!value || value.includes("\\") || value.startsWith("/") || value.includes("\0")) return undefined;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return undefined;
  return value;
}

function requiredHash(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): string | undefined {
  const value = requiredString(input, key, path, issues);
  if (value && !/^[a-f0-9]{64}$/i.test(value)) issues.push({ path: `${path}.${key}`, code: "format", message: "expected a SHA-256 hex digest" });
  return value;
}

function requiredNonNegativeInteger(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): number {
  if (!Number.isInteger(input[key]) || Number(input[key]) < 0) {
    issues.push({ path: `${path}.${key}`, code: "value", message: "expected a non-negative integer" });
    return 0;
  }
  return Number(input[key]);
}

function requiredTimestamp(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): string | undefined {
  const value = requiredString(input, key, path, issues);
  if (value && Number.isNaN(Date.parse(value))) issues.push({ path: `${path}.${key}`, code: "format", message: "expected an ISO-8601 timestamp" });
  return value;
}

function optionalStringArray(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): string[] | undefined {
  if (input[key] === undefined) return undefined;
  if (!Array.isArray(input[key]) || input[key].some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push({ path: `${path}.${key}`, code: "type", message: "expected an array of non-empty strings" });
    return undefined;
  }
  return [...new Set((input[key] as string[]).map((item) => item.trim()))].sort((left, right) => left.localeCompare(right));
}

function optionalNonNegativeNumber(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): number | undefined {
  if (input[key] === undefined) return undefined;
  if (typeof input[key] !== "number" || !Number.isFinite(input[key]) || input[key] < 0) {
    issues.push({ path: `${path}.${key}`, code: "value", message: "expected a non-negative number" });
    return undefined;
  }
  return input[key];
}
