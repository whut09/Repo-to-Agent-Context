import { statSync } from "node:fs";
import path from "node:path";
import type { ContextSchemaIssue, ContextValidationResult } from "./schema.js";
import { invalidResult, validResult } from "./schema.js";
import type { ContextFileRole } from "./types.js";
import type { ParsedContextDocument } from "./frontmatter.js";

export interface ContextContentPolicy {
  maxFileBytes?: number;
  requireMarkdownBody?: boolean;
}

export interface ValidatedContextContent {
  filePath: string;
  byteLength: number;
  body: string;
}

export function validateContextDocument(document: ParsedContextDocument, policy: ContextContentPolicy = {}): ContextValidationResult<ValidatedContextContent> {
  const maxFileBytes = policy.maxFileBytes ?? 2 * 1024 * 1024;
  const body = document.body;
  const byteLength = Buffer.byteLength(body, "utf8");
  const issues: ContextSchemaIssue[] = [];
  if (byteLength > maxFileBytes) {
    issues.push({ path: document.filePath, code: "value", message: `content exceeds ${maxFileBytes} bytes` });
  }
  if (body.includes("\0")) {
    issues.push({ path: document.filePath, code: "format", message: "content contains a NUL character" });
  }
  if ((policy.requireMarkdownBody ?? true) && body.trim() === "") {
    issues.push({ path: document.filePath, code: "required", message: "document body must not be empty" });
  }
  if (issues.length) return invalidResult(issues);
  return validResult({ filePath: document.filePath, byteLength, body });
}

export function validateCompanionContent(
  filePath: string,
  content: string,
  policy: ContextContentPolicy = {}
): ContextValidationResult<ValidatedContextContent> {
  const maxFileBytes = policy.maxFileBytes ?? 2 * 1024 * 1024;
  const byteLength = Buffer.byteLength(content, "utf8");
  const issues: ContextSchemaIssue[] = [];
  if (byteLength > maxFileBytes) issues.push({ path: filePath, code: "value", message: `content exceeds ${maxFileBytes} bytes` });
  if (content.includes("\0")) issues.push({ path: filePath, code: "format", message: "content contains a NUL character" });
  if (issues.length) return invalidResult(issues);
  return validResult({ filePath, byteLength, body: content });
}

export function contextFileRole(filePath: string): ContextFileRole {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");
  if (segments.at(-1) === "doc.md" || segments.at(-1) === "skill.md") return "entry";
  if (segments.includes("references") || segments.at(-1)?.includes("reference")) return "reference";
  if (segments.includes("examples") || segments.at(-1)?.includes("example")) return "example";
  if (segments.includes("errors") || segments.at(-1)?.includes("error")) return "error";
  return "other";
}

export function companionUpdatedAt(filePath: string): string {
  return statSync(path.resolve(filePath)).mtime.toISOString();
}
