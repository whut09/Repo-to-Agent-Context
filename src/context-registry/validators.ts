import {
  invalidResult,
  isRecord,
  optionalString,
  requiredPositiveInteger,
  requiredString,
  validateSchemaEnvelope,
  validResult,
  type ContextValidationResult,
  type ContextSchemaIssue
} from "./schema.js";
import type { ContextFile, ContextFileRole, ContextProvenance, ContextSource, ContextTrustLevel } from "./types.js";

const FILE_ROLES = new Set<ContextFileRole>(["entry", "reference", "example", "error", "other"]);
const SOURCE_KINDS = new Set(["local", "remote", "bundled"]);
const TRUST_LEVELS = new Set<ContextTrustLevel>(["official", "maintainer", "community", "private", "untrusted"]);

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
