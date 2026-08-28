import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AgentExecutorName } from "../harness/control-plane/orchestrator.js";
import { isTestExecutionCommand } from "../core/test-command.js";

export type AgentEvent =
  | { type: "message"; role: "assistant" | "user"; text: string; ts: string }
  | { type: "tool_call"; tool: string; args: unknown; ts: string }
  | { type: "file_read"; path: string; ts: string }
  | { type: "file_edit"; path: string; ts: string }
  | { type: "command_run"; command: string; exitCode?: number; ts: string }
  | { type: "test_run"; command: string; exitCode: number; ts: string }
  | { type: "error"; message: string; ts: string };

export interface AgentEventNormalizationInput {
  executor: AgentExecutorName;
  stdout: string;
  stderr: string;
  repo: string;
  transcriptPath?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
}

export interface AgentEventNormalizationResult {
  source: "opencode-json" | "opencode-transcript" | "generic-output";
  events: AgentEvent[];
  warnings: string[];
}

export function normalizeAgentEvents(input: AgentEventNormalizationInput): AgentEventNormalizationResult {
  if (input.executor === "opencode") {
    const stdoutEvents = normalizeOpenCodeJsonStream(input.stdout);
    const transcriptEvents = input.transcriptPath ? normalizeOpenCodeTranscript(input.repo, input.transcriptPath) : emptyResult("opencode-transcript");
    const events = [...stdoutEvents.events, ...transcriptEvents.events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    if (events.length) {
      return {
        source: stdoutEvents.events.length ? "opencode-json" : "opencode-transcript",
        events,
        warnings: [...stdoutEvents.warnings, ...transcriptEvents.warnings]
      };
    }
    return genericFallback(input, [...stdoutEvents.warnings, ...transcriptEvents.warnings]);
  }

  return genericFallback(input);
}

export function normalizeOpenCodeJsonStream(stdout: string): AgentEventNormalizationResult {
  const parsed = parseJsonRecords(stdout);
  const events = parsed.records.flatMap((record) => eventFromOpenCodeRecord(record)).filter((event): event is AgentEvent => Boolean(event));
  return {
    source: "opencode-json",
    events,
    warnings: parsed.warnings
  };
}

export function normalizeOpenCodeTranscript(repo: string, transcriptPath: string): AgentEventNormalizationResult {
  const resolved = path.isAbsolute(transcriptPath) ? transcriptPath : path.resolve(repo, transcriptPath);
  if (!existsSync(resolved)) {
    return {
      source: "opencode-transcript",
      events: [],
      warnings: [`OpenCode transcript not found: ${transcriptPath}`]
    };
  }
  const content = readFileSync(resolved, "utf8");
  const parsed = parseJsonRecords(content);
  const events = parsed.records.flatMap((record) => eventFromOpenCodeRecord(record)).filter((event): event is AgentEvent => Boolean(event));
  if (events.length) return { source: "opencode-transcript", events, warnings: parsed.warnings };

  return {
    source: "opencode-transcript",
    events: transcriptTextFallback(content),
    warnings: parsed.warnings
  };
}

function emptyResult(source: AgentEventNormalizationResult["source"]): AgentEventNormalizationResult {
  return { source, events: [], warnings: [] };
}

function genericFallback(input: AgentEventNormalizationInput, warnings: string[] = []): AgentEventNormalizationResult {
  const ts = input.finishedAt ?? input.startedAt ?? new Date().toISOString();
  const events: AgentEvent[] = [];
  const output = [input.stdout.trim(), input.stderr.trim()].filter(Boolean).join("\n--- stderr ---\n");
  if (output) {
    events.push(
      input.exitCode && input.exitCode !== 0
        ? { type: "error", message: output.slice(0, 4000), ts }
        : { type: "message", role: "assistant", text: output.slice(0, 4000), ts }
    );
  }
  return { source: "generic-output", events, warnings };
}

function transcriptTextFallback(content: string): AgentEvent[] {
  const ts = new Date().toISOString();
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 200).map((line) => ({ type: "message", role: "assistant", text: line, ts }));
}

function parseJsonRecords(text: string): { records: unknown[]; warnings: string[] } {
  const trimmed = text.trim();
  if (!trimmed) return { records: [], warnings: [] };
  const whole = parseJson(trimmed);
  if (whole.ok) return { records: flattenJsonRecords(whole.value), warnings: [] };

  const records: unknown[] = [];
  const warnings: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const value = parseJson(line.trim());
    if (value.ok) {
      records.push(...flattenJsonRecords(value.value));
    } else if (line.trim().startsWith("{") || line.trim().startsWith("[")) {
      warnings.push(`Unable to parse JSON event line: ${line.slice(0, 120)}`);
    }
  }
  return { records, warnings };
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function flattenJsonRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonRecords);
  if (isRecord(value)) {
    for (const key of ["events", "items", "messages", "data"]) {
      const child = value[key];
      if (Array.isArray(child)) return child.flatMap(flattenJsonRecords);
    }
  }
  return [value];
}

function eventFromOpenCodeRecord(record: unknown): AgentEvent | AgentEvent[] | undefined {
  if (!isRecord(record)) return undefined;
  const type = stringField(record, "type") ?? stringField(record, "event") ?? stringField(record, "name") ?? "";
  const lowerType = type.toLowerCase();
  const ts = timestampFor(record);

  if (lowerType.includes("message")) {
    const role = roleFor(record);
    const text = textFor(record);
    if (text) return { type: "message", role, text, ts };
  }

  if (lowerType.includes("part")) {
    const part = record.part;
    if (isRecord(part)) return eventFromOpenCodeRecord({ ...part, ts });
  }

  if (lowerType.includes("tool")) {
    const tool = stringField(record, "tool") ?? stringField(record, "name") ?? stringField(record, "toolName") ?? stringField(record, "call") ?? "unknown";
    const args = record.args ?? record.arguments ?? record.input ?? record.parameters ?? record.params ?? {};
    const fileEvent = fileEventFromTool(tool, args, ts);
    if (fileEvent) return fileEvent;
    const commandEvent = commandEventFromTool(tool, args, record, ts);
    if (commandEvent) return commandEvent;
    return { type: "tool_call", tool, args, ts };
  }

  const pathValue = pathFor(record);
  if (pathValue && /read/.test(lowerType)) return { type: "file_read", path: pathValue, ts };
  if (pathValue && /(edit|write|patch|modify)/.test(lowerType)) return { type: "file_edit", path: pathValue, ts };

  const command = commandFor(record);
  if (command) return commandEvent(command, exitCodeFor(record), ts);

  if (lowerType.includes("error")) {
    return { type: "error", message: textFor(record) || JSON.stringify(record), ts };
  }

  return undefined;
}

function fileEventFromTool(tool: string, args: unknown, ts: string): AgentEvent | undefined {
  const lower = tool.toLowerCase();
  const pathValue = pathFor(args);
  if (!pathValue) return undefined;
  if (/(read|view|grep|glob|list|ls)/.test(lower)) return { type: "file_read", path: pathValue, ts };
  if (/(edit|write|patch|apply|create|delete|rename)/.test(lower)) return { type: "file_edit", path: pathValue, ts };
  return undefined;
}

function commandEventFromTool(tool: string, args: unknown, record: Record<string, unknown>, ts: string): AgentEvent | undefined {
  const lower = tool.toLowerCase();
  if (!/(bash|shell|terminal|cmd|command|exec|run|test)/.test(lower)) return undefined;
  const command = commandFor(args) ?? commandFor(record);
  if (!command) return undefined;
  return commandEvent(command, exitCodeFor(record), ts);
}

function commandEvent(command: string, exitCode: number | undefined, ts: string): AgentEvent {
  if (isTestExecutionCommand(command)) return { type: "test_run", command, exitCode: exitCode ?? 0, ts };
  return exitCode === undefined ? { type: "command_run", command, ts } : { type: "command_run", command, exitCode, ts };
}

function roleFor(record: Record<string, unknown>): "assistant" | "user" {
  const role = stringField(record, "role") ?? stringField(record, "author") ?? stringField(record, "speaker");
  return role === "user" ? "user" : "assistant";
}

function textFor(record: Record<string, unknown>): string | undefined {
  const direct = stringField(record, "text") ?? stringField(record, "content") ?? stringField(record, "message") ?? stringField(record, "delta");
  if (direct) return direct;
  const part = record.part;
  if (isRecord(part)) return textFor(part);
  return undefined;
}

function pathFor(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const direct = stringField(value, "path") ?? stringField(value, "file") ?? stringField(value, "filename") ?? stringField(value, "filePath");
  if (direct) return normalizePath(direct);
  const args = value.args ?? value.arguments ?? value.input ?? value.params;
  if (isRecord(args)) return pathFor(args);
  return undefined;
}

function commandFor(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return stringField(value, "command") ?? stringField(value, "cmd") ?? stringField(value, "script");
}

function exitCodeFor(record: Record<string, unknown>): number | undefined {
  const raw = record.exitCode ?? record.exit_code ?? record.code ?? record.status;
  return typeof raw === "number" ? raw : undefined;
}

function timestampFor(record: Record<string, unknown>): string {
  const raw = stringField(record, "ts") ?? stringField(record, "time") ?? stringField(record, "timestamp") ?? stringField(record, "createdAt");
  if (raw && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  return new Date().toISOString();
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
