import path from "node:path";
import { readJsonDiagnostic, writeJsonAtomicWithRevision, type JsonReadResult } from "../core/atomic-store.js";
import { assertValid, type ContextSchemaIssue } from "./schema.js";
import { validateContextPack } from "./validators.js";
import type { ContextPack } from "./types.js";

export interface ContextRegistryReadCorrupt {
  status: "corrupt";
  filePath: string;
  error: string;
  issues?: ContextSchemaIssue[];
}

export type ContextRegistryReadResult = JsonReadResult<ContextPack> | ContextRegistryReadCorrupt;

export function contextRegistryPath(root: string): string {
  return path.join(path.resolve(root), ".agent-context", "registry", "context-pack.json");
}

export function readContextPack(root: string): ContextRegistryReadResult {
  const filePath = contextRegistryPath(root);
  const result = readJsonDiagnostic<ContextPack>(filePath);
  if (result.status !== "ok") return result;
  const validated = validateContextPack(result.value);
  if (!validated.valid) {
    return {
      status: "corrupt",
      filePath,
      error: validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
      issues: validated.issues
    };
  }
  return { status: "ok", value: validated.value! };
}

export function writeContextPack(root: string, pack: ContextPack, expectedRevision?: number): ContextPack {
  const value = assertValid(validateContextPack(pack));
  const current = readContextPack(root);
  const revision = expectedRevision ?? (current.status === "ok" ? current.value.revision : 0);
  return writeJsonAtomicWithRevision(contextRegistryPath(root), value, revision) as ContextPack;
}
