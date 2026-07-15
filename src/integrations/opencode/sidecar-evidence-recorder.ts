import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { collectWorkingTreeFiles } from "../../core/git.js";
import {
  appendExecutionTraceStep,
  currentWorkingTreeHash,
  executionTracePath,
  readExecutionTrace,
  startExecutionTrace
} from "../../harness/observability/execution-trace.js";
import { sanitizeToolOutput } from "./output-sanitizer.js";
import { isGeneratedSidecarOutput, normalizeToolPath } from "./sidecar-path-guard.js";
import type { OpenCodeSidecarToolRecordInput, OpenCodeSidecarToolRecordResult } from "./sidecar.js";

export function recordSidecarTool(repo = ".", input: OpenCodeSidecarToolRecordInput = {}): OpenCodeSidecarToolRecordResult {
  const root = path.resolve(repo);
  const tracesDir = path.join(root, ".agent-context", "traces");
  const eventLogPath = path.join(tracesDir, "opencode-sidecar-events.jsonl");
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  const startedAt = input.startedAt ?? finishedAt;
  const tool = input.tool?.trim() || "unknown";
  const command = input.command?.trim() || null;
  const sessionId = normalizeSessionId(input.sessionId);
  const traceId = `opencode-session-${sessionId}`;
  const stdout = normalizeToolOutputEvidence("stdout", input);
  const stderr = normalizeToolOutputEvidence("stderr", input);
  const workingTreeHashBefore = input.workingTreeHashBefore ?? currentWorkingTreeHash(root);
  const workingTreeHashAfter = input.workingTreeHashAfter ?? currentWorkingTreeHash(root);
  const filesTouched = [...new Set([...(input.paths ?? []).map(normalizeToolPath).filter(Boolean), ...safeChangedFiles(root)])].sort();
  const event = {
    type: "tool.execute.after" as const,
    ts: finishedAt,
    tool,
    command,
    exitCode: typeof input.exitCode === "number" ? input.exitCode : null,
    startedAt,
    finishedAt,
    stdoutHash: stdout.hash,
    stderrHash: stderr.hash,
    stdoutPreview: stdout.preview,
    stderrPreview: stderr.preview,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    stdoutRedacted: stdout.redacted,
    stderrRedacted: stderr.redacted,
    workingTreeHashBefore,
    workingTreeHashAfter,
    filesTouched,
    sessionId
  };

  mkdirSync(tracesDir, { recursive: true });
  appendFileSync(eventLogPath, `${JSON.stringify(event)}\n`, "utf8");
  let trace = readExecutionTrace(root, traceId);
  if (!trace) trace = startExecutionTrace(root, `OpenCode sidecar session ${sessionId}`, { id: traceId, agent: "opencode" });
  trace = appendExecutionTraceStep(root, traceId, {
    agent: "opencode",
    action: inferToolAction(tool, command),
    files: filesTouched,
    reason: "Captured from OpenCode tool.execute.after.",
    command: command ?? undefined,
    result: typeof input.exitCode === "number" ? (input.exitCode === 0 ? "passed" : "failed") : "unknown",
    evidenceSource: "command",
    capturedBy: "opencode-plusplus",
    exitCode: input.exitCode,
    startedAt,
    finishedAt,
    stdoutHash: stdout.hash,
    stderrHash: stderr.hash,
    stdoutPreview: stdout.preview,
    stderrPreview: stderr.preview,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    stdoutRedacted: stdout.redacted,
    stderrRedacted: stderr.redacted,
    workingTreeHashBefore,
    workingTreeHashAfter
  });
  const step = trace.steps.at(-1);
  if (!step) throw new Error(`Failed to append OpenCode sidecar trace step: ${traceId}`);
  return { repo: root, eventLogPath, traceId, tracePath: executionTracePath(root, traceId), event, trace, step };
}

function safeChangedFiles(root: string): string[] {
  try {
    return collectWorkingTreeFiles(root, true).filter((file) => !isGeneratedSidecarOutput(file));
  } catch {
    return [];
  }
}

function normalizeSessionId(value: string | undefined): string {
  const normalized = (value ?? "default")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "default";
}

function normalizeToolOutputEvidence(kind: "stdout" | "stderr", input: OpenCodeSidecarToolRecordInput) {
  const text = kind === "stdout" ? input.stdout : input.stderr;
  const explicitHash = kind === "stdout" ? input.stdoutHash : input.stderrHash;
  const explicitPreview = kind === "stdout" ? input.stdoutPreview : input.stderrPreview;
  const explicitTruncated = kind === "stdout" ? input.stdoutTruncated : input.stderrTruncated;
  const explicitRedacted = kind === "stdout" ? input.stdoutRedacted : input.stderrRedacted;
  if (typeof text === "string") {
    const sanitized = sanitizeToolOutput(text);
    return { hash: explicitHash ?? sanitized.hash, preview: sanitized.preview, truncated: sanitized.truncated, redacted: sanitized.redacted };
  }
  if (typeof explicitPreview === "string") {
    const sanitized = sanitizeToolOutput(explicitPreview);
    return {
      hash: explicitHash ?? sanitized.hash,
      preview: sanitized.preview,
      truncated: explicitTruncated ?? sanitized.truncated,
      redacted: explicitRedacted ?? sanitized.redacted
    };
  }
  const empty = sanitizeToolOutput("");
  return { hash: explicitHash ?? empty.hash, preview: "", truncated: explicitTruncated ?? false, redacted: explicitRedacted ?? false };
}

function inferToolAction(tool: string, command: string | null): string {
  const text = `${tool} ${command ?? ""}`.toLowerCase();
  if (/\b(test|vitest|jest|pytest|node --test)\b/.test(text)) return "run-test";
  if (/\b(lint|eslint|biome|prettier)\b/.test(text)) return "lint";
  if (/\b(typecheck|tsc|mypy|pyright)\b/.test(text)) return "typecheck";
  if (/\b(build|compile)\b/.test(text)) return "build";
  if (/\b(write|edit|patch|apply)\b/.test(text)) return "edit";
  return "tool-execute";
}
