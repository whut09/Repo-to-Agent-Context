import type { CONTEXT_REGISTRY_SCHEMA_VERSION } from "./types.js";

export interface ContextSchemaIssue {
  path: string;
  code: "required" | "type" | "value" | "version" | "revision" | "format" | "frontmatter" | "path";
  message: string;
}

export interface ContextValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: ContextSchemaIssue[];
}

export class ContextSchemaError extends Error {
  constructor(readonly issues: ContextSchemaIssue[]) {
    super(`Invalid context registry value: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
}

export function schemaVersionIssue(path: string, actual: unknown): ContextSchemaIssue {
  return {
    path,
    code: "version",
    message: `expected schemaVersion ${String(1 satisfies typeof CONTEXT_REGISTRY_SCHEMA_VERSION)}, received ${String(actual)}`
  };
}

export function revisionIssue(path: string, actual: unknown): ContextSchemaIssue {
  return {
    path,
    code: "revision",
    message: `expected a non-negative integer revision, received ${String(actual)}`
  };
}

export function invalidResult<T>(issues: ContextSchemaIssue[]): ContextValidationResult<T> {
  return { valid: false, issues };
}

export function validResult<T>(value: T): ContextValidationResult<T> {
  return { valid: true, value, issues: [] };
}

export function assertValid<T>(result: ContextValidationResult<T>): T {
  if (!result.valid || result.value === undefined) throw new ContextSchemaError(result.issues);
  return result.value;
}

export function validateSchemaEnvelope(input: unknown, path = "$", schemaVersion = 1): ContextSchemaIssue[] {
  const issues: ContextSchemaIssue[] = [];
  if (!isRecord(input)) {
    issues.push({ path, code: "type", message: "expected an object" });
    return issues;
  }
  if (input.schemaVersion !== schemaVersion) issues.push(schemaVersionIssue(`${path}.schemaVersion`, input.schemaVersion));
  if (!Number.isInteger(input.revision) || Number(input.revision) < 0) issues.push(revisionIssue(`${path}.revision`, input.revision));
  return issues;
}

export function requiredString(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): string | undefined {
  if (typeof input[key] !== "string" || input[key].trim() === "") {
    issues.push({ path: `${path}.${key}`, code: "required", message: "expected a non-empty string" });
    return undefined;
  }
  return input[key];
}

export function optionalString(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): string | undefined {
  if (input[key] === undefined) return undefined;
  if (typeof input[key] !== "string") {
    issues.push({ path: `${path}.${key}`, code: "type", message: "expected a string" });
    return undefined;
  }
  return input[key];
}

export function requiredStringArray(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): string[] {
  if (!Array.isArray(input[key]) || input[key].some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push({ path: `${path}.${key}`, code: "type", message: "expected an array of non-empty strings" });
    return [];
  }
  return [...(input[key] as string[])];
}

export function requiredPositiveInteger(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): number {
  if (!Number.isInteger(input[key]) || Number(input[key]) < 1) {
    issues.push({ path: `${path}.${key}`, code: "value", message: "expected a positive integer" });
    return 0;
  }
  return Number(input[key]);
}

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
