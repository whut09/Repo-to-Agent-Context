import { createHash } from "node:crypto";
import path from "node:path";
import { appendJsonLineLocked } from "../../../core/atomic-store.js";

export interface OpenCodeSidecarRuntimeContext {
  directory: string;
  worktree?: string;
  client?: {
    app?: {
      log?: (input: { service: string; level: string; message: string; extra?: Record<string, unknown> }) => void;
    };
    tui?: {
      toast?: {
        show?: (input: { title: string; message: string }) => void;
      };
    };
  };
}

export function notifyOpenCodePlusPlusToast(context: OpenCodeSidecarRuntimeContext, title: string, message: string): "toast" | "log" {
  const toast = context.client?.tui?.toast?.show;
  if (typeof toast === "function") {
    try {
      toast.call(context.client?.tui?.toast, { title, message });
      return "toast";
    } catch {
      // Fall through to structured logging; a toast failure must never break the session.
    }
  }
  try {
    context.client?.app?.log?.({
      service: "opencode-plusplus",
      level: "info",
      message: `${title}: ${message}`,
      extra: { toast: true }
    });
  } catch {
    // Structured logging is best-effort and must never interrupt OpenCode.
  }
  return "log";
}

export interface OpenCodeSidecarRecorder {
  eventLog: string;
  record: (type: string, payload?: Record<string, unknown>) => void;
  log: (level: string, message: string, extra?: Record<string, unknown>) => void;
}

export interface OpenCodeSidecarEvent {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  sessionId: string;
  taskId: string | null;
  timestamp: string;
  type: string;
  ts: string;
  directory: string;
  worktree?: string;
  [key: string]: unknown;
}

export function createSidecarRecorder(context: OpenCodeSidecarRuntimeContext): OpenCodeSidecarRecorder {
  const eventLog = path.join(context.directory, ".agent-context", "traces", "opencode-sidecar-events.jsonl");

  function record(type: string, payload: Record<string, unknown> = {}): void {
    try {
      const timestamp = new Date().toISOString();
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : typeof payload.sessionID === "string" ? payload.sessionID : "default";
      const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
      const eventId = typeof payload.eventId === "string" && payload.eventId.trim() ? payload.eventId : eventIdFor(type, payload, timestamp);
      appendJsonLineLocked(eventLog, {
        schemaVersion: 1,
        eventId,
        sequence: 0,
        sessionId,
        taskId,
        timestamp,
        type,
        ts: timestamp,
        directory: context.directory,
        worktree: context.worktree,
        ...payload
      });
    } catch {
      // The sidecar must never break OpenCode. Verification can still run manually.
    }
  }

  function log(level: string, message: string, extra: Record<string, unknown> = {}): void {
    record("sidecar.log", { level, message, ...extra });
    try {
      context.client?.app?.log?.({
        service: "opencode-plusplus",
        level,
        message,
        extra
      });
    } catch {
      // Structured logging is best-effort and must never interrupt OpenCode.
    }
  }

  return { eventLog, record, log };
}

function eventIdFor(type: string, payload: Record<string, unknown>, timestamp: string): string {
  const callId = typeof payload.callId === "string" ? payload.callId : undefined;
  if (callId) return `${type}:${callId}`;
  return `${type}:${timestamp}:${createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 16)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
