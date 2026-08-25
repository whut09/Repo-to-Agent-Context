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
import type {
  ContextAnnotation,
  ContextEntry,
  ContextEntryKind,
  ContextFile,
  ContextFileRole,
  ContextProvenance,
  ContextSource,
  ContextTrustLevel
} from "./types.js";

const FILE_ROLES = new Set<ContextFileRole>(["entry", "reference", "example", "error", "other"]);
const SOURCE_KINDS = new Set(["local", "remote", "bundled"]);
const TRUST_LEVELS = new Set<ContextTrustLevel>(["official", "maintainer", "community", "private", "untrusted"]);
const ENTRY_KINDS = new Set<ContextEntryKind>(["doc", "skill", "reference", "task-pack", "repository"]);

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
  return validResult({ ...input, sourceName, sourceTrustLevel, entryId, packageVersion, contentRevision, contentHash, fetchedAt, verified } as ContextProvenance);
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
  return validResult({ ...input, id, repository, entryId, packageVersion, contentRevision, note, trustLevel: "untrusted", createdAt, updatedAt } as ContextAnnotation);
}

export function validateContextEntry(input: unknown, path = "$"): ContextValidationResult<ContextEntry> {
  const issues = validateSchemaEnvelope(input, path);
  if (!isRecord(input)) return invalidResult(issues);
  const id = requiredString(input, "id", path, issues);
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
    provenance: provenanceResult.value!
  } as ContextEntry);
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
