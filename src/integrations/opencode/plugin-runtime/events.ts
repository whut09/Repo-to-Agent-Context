import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

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

export function createSidecarRecorder(context: OpenCodeSidecarRuntimeContext): OpenCodeSidecarRecorder {
  const eventLog = path.join(context.directory, ".agent-context", "traces", "opencode-sidecar-events.jsonl");

  function record(type: string, payload: Record<string, unknown> = {}): void {
    try {
      mkdirSync(path.dirname(eventLog), { recursive: true });
      appendFileSync(
        eventLog,
        `${JSON.stringify({
          type,
          ts: new Date().toISOString(),
          directory: context.directory,
          worktree: context.worktree,
          ...payload
        })}\n`,
        "utf8"
      );
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
