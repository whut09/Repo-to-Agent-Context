import yaml from "js-yaml";
import { invalidResult, isRecord, validResult, type ContextSchemaIssue, type ContextValidationResult } from "./schema.js";
import type { ContextEntryKind, ContextTrustLevel } from "./types.js";

export type ContextDocumentKind = Extract<ContextEntryKind, "doc" | "skill">;

export interface ContextFrontmatter {
  name: string;
  description: string;
  kind: ContextDocumentKind;
  languages: string[];
  versions: string[];
  revision: number;
  updatedAt: string;
  sourceTrustLevel: ContextTrustLevel;
  tags: string[];
  apiVersion?: string;
}

export interface ParsedContextDocument {
  filePath: string;
  body: string;
  frontmatter: ContextFrontmatter;
}

export function parseContextFrontmatter(content: string, filePath: string, kind = kindFromPath(filePath)): ContextValidationResult<ParsedContextDocument> {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return invalidResult([{ path: `${filePath}:frontmatter`, code: "frontmatter", message: "document must start with YAML frontmatter" }]);
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && ["---", "..."].includes(line.trim()));
  if (endIndex < 0) {
    return invalidResult([{ path: `${filePath}:frontmatter`, code: "frontmatter", message: "frontmatter is not terminated" }]);
  }

  let raw: unknown;
  try {
    raw = yaml.load(lines.slice(1, endIndex).join("\n"), { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    return invalidResult([
      {
        path: `${filePath}:frontmatter`,
        code: "frontmatter",
        message: error instanceof Error ? error.message : String(error)
      }
    ]);
  }

  const result = normalizeFrontmatter(raw, filePath, kind);
  if (!result.valid) return invalidResult(result.issues);
  return validResult({
    filePath,
    body: lines
      .slice(endIndex + 1)
      .join("\n")
      .replace(/^\n/, ""),
    frontmatter: result.value!
  });
}

export function kindFromPath(filePath: string): ContextDocumentKind {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  return normalized.split("/").at(-1) === "skill.md" ? "skill" : "doc";
}

function normalizeFrontmatter(input: unknown, filePath: string, kind: ContextDocumentKind): ContextValidationResult<ContextFrontmatter> {
  const issues: ContextSchemaIssue[] = [];
  if (!isRecord(input)) {
    return invalidResult([{ path: `${filePath}:frontmatter`, code: "type", message: "expected a YAML object" }]);
  }
  const metadata = input.metadata;
  if (!isRecord(metadata)) {
    return invalidResult([{ path: `${filePath}:frontmatter.metadata`, code: "required", message: "expected a metadata object" }]);
  }

  const name = requiredString(input, "name", `${filePath}:frontmatter`, issues);
  const description = requiredString(input, "description", `${filePath}:frontmatter`, issues);
  const revision = positiveInteger(metadata.revision, `${filePath}:frontmatter.metadata.revision`, issues);
  const updatedAt = normalizeDate(metadata["updated-on"], `${filePath}:frontmatter.metadata.updated-on`, issues);
  const sourceTrustLevel = normalizeTrust(metadata.source, `${filePath}:frontmatter.metadata.source`, issues);
  const languages = normalizeList(metadata.languages, `${filePath}:frontmatter.metadata.languages`, issues, kind === "doc");
  const versions = normalizeList(metadata.versions, `${filePath}:frontmatter.metadata.versions`, issues, kind === "doc");
  const tags = normalizeList(metadata.tags, `${filePath}:frontmatter.metadata.tags`, issues, false);
  const apiVersion = optionalString(metadata.apiVersion ?? metadata["api-version"], `${filePath}:frontmatter.metadata.apiVersion`, issues);

  if (kind !== "doc" && kind !== "skill") {
    issues.push({ path: `${filePath}:frontmatter.kind`, code: "value", message: `unsupported document kind ${kind}` });
  }
  if (issues.length) return invalidResult(issues);
  return validResult({
    name: name!,
    description: description!,
    kind,
    languages,
    versions,
    revision,
    updatedAt: updatedAt!,
    sourceTrustLevel: sourceTrustLevel!,
    tags,
    ...(apiVersion ? { apiVersion } : {})
  });
}

function requiredString(input: Record<string, unknown>, key: string, path: string, issues: ContextSchemaIssue[]): string | undefined {
  if (typeof input[key] !== "string" || input[key].trim() === "") {
    issues.push({ path: `${path}.${key}`, code: "required", message: "expected a non-empty string" });
    return undefined;
  }
  return input[key] as string;
}

function optionalString(value: unknown, path: string, issues: ContextSchemaIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ path, code: "type", message: "expected a non-empty string" });
    return undefined;
  }
  return value.trim();
}

function positiveInteger(value: unknown, path: string, issues: ContextSchemaIssue[]): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    issues.push({ path, code: "revision", message: "expected a positive integer" });
    return 0;
  }
  return Number(value);
}

function normalizeDate(value: unknown, path: string, issues: ContextSchemaIssue[]): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      issues.push({ path, code: "format", message: "expected an ISO-8601 date" });
      return undefined;
    }
    return value.toISOString();
  }
  const text = optionalString(value, path, issues);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    issues.push({ path, code: "format", message: "expected an ISO-8601 date" });
    return undefined;
  }
  return date.toISOString();
}

function normalizeTrust(value: unknown, path: string, issues: ContextSchemaIssue[]): ContextTrustLevel | undefined {
  const trust = optionalString(value, path, issues);
  if (!trust) return undefined;
  const allowed: ContextTrustLevel[] = ["official", "maintainer", "community", "private", "untrusted"];
  if (!allowed.includes(trust as ContextTrustLevel)) {
    issues.push({ path, code: "value", message: `unsupported trust level ${trust}` });
    return undefined;
  }
  return trust as ContextTrustLevel;
}

function normalizeList(value: unknown, path: string, issues: ContextSchemaIssue[], required: boolean): string[] {
  if (value === undefined) {
    if (required) issues.push({ path, code: "required", message: "expected a string or string array" });
    return [];
  }
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : undefined;
  if (!values || values.some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push({ path, code: "type", message: "expected a string or string array" });
    return [];
  }
  return [...new Set(values.map((item) => item.trim()))].sort((left, right) => left.localeCompare(right));
}
