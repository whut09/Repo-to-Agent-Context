import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { invalidResult, validResult, type ContextSchemaIssue, type ContextValidationResult } from "./schema.js";
import type { ContextSourceConfig } from "./types.js";

export interface ContextPathOptions {
  repositoryRoot?: string;
  currentDirectory?: string;
}

export interface ResolvedContextSource {
  source: ContextSourceConfig;
  root: string;
}

export function resolveContextSource(source: ContextSourceConfig, options: ContextPathOptions = {}): ContextValidationResult<ResolvedContextSource> {
  const base = path.resolve(options.repositoryRoot ?? options.currentDirectory ?? process.cwd());
  if (source.kind === "remote") {
    return invalidResult([{ path: "source.kind", code: "value", message: "remote context sources are not supported by the local builder" }]);
  }
  if (!source.location.trim()) {
    return invalidResult([{ path: "source.location", code: "required", message: "source location must not be empty" }]);
  }
  const root = path.resolve(base, source.location);
  if (!existsSync(root)) {
    return invalidResult([{ path: "source.location", code: "path", message: `context source does not exist: ${root}` }]);
  }
  if (!statSync(root).isDirectory()) {
    return invalidResult([{ path: "source.location", code: "path", message: `context source is not a directory: ${root}` }]);
  }
  const realRoot = realpathSync(root);
  return validResult({ source, root: realRoot });
}

export function resolveContextFile(root: string, relativePath: string): ContextValidationResult<string> {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return invalidResult([{ path: "path", code: "path", message: "context file path must be relative and cannot traverse outside its source" }]);
  }
  const resolvedRoot = realpathIfExists(root);
  const candidate = path.resolve(resolvedRoot, normalized);
  if (!isWithin(resolvedRoot, candidate)) {
    return invalidResult([{ path: "path", code: "path", message: "context file path resolves outside its source" }]);
  }
  if (existsSync(candidate) && !isWithin(resolvedRoot, realpathSync(candidate))) {
    return invalidResult([{ path: "path", code: "path", message: "context file symlink resolves outside its source" }]);
  }
  return validResult(candidate);
}

export function normalizeRelativePath(value: string): string | undefined {
  if (!value || value.includes("\0")) return undefined;
  const slashPath = value.replaceAll("\\", "/");
  if (slashPath.startsWith("/") || /^[A-Za-z]:\//.test(slashPath)) return undefined;
  const segments = slashPath.split("/");
  if (segments.some((segment) => segment === "..")) return undefined;
  const normalized = path.posix.normalize(slashPath);
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") return undefined;
  return normalized;
}

export function relativeContextPath(root: string, absolutePath: string): string | undefined {
  const resolvedRoot = realpathIfExists(root);
  const resolvedPath = path.resolve(absolutePath);
  if (!isWithin(resolvedRoot, resolvedPath)) return undefined;
  return normalizeRelativePath(path.relative(resolvedRoot, resolvedPath));
}

function realpathIfExists(value: string): string {
  return existsSync(value) ? realpathSync(value) : path.resolve(value);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function pathIssue(pathName: string, message: string): ContextSchemaIssue {
  return { path: pathName, code: "path", message };
}
