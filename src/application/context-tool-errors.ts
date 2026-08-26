import type { ContextToolError } from "./context-tools-protocol.js";

export function contextToolError(error: unknown): ContextToolError {
  const message = error instanceof Error ? error.message : String(error);
  if (/path traversal|normalized relative path|repository-relative path|cannot be combined with a file selector/i.test(message)) {
    return diagnostic("INVALID_PATH", message, false);
  }
  if (/entry was not found|was not found:|unavailable for entry/i.test(message)) return diagnostic("ENTRY_NOT_FOUND", message, false);
  if (/source is not configured|source .* not found/i.test(message)) return diagnostic("SOURCE_NOT_FOUND", message, false);
  if (/network|fetch|offline|timeout|http \d+/i.test(message)) return diagnostic("NETWORK_FAILURE", message, true);
  if (/registry|context source is invalid|schemaVersion/i.test(message)) return diagnostic("REGISTRY_INVALID", message, false);
  if (/corrupt|unable to read .*store|invalid .*store/i.test(message)) return diagnostic("STATE_CORRUPT", message, false);
  return diagnostic("INTERNAL_ERROR", message || "Unknown Context tool failure.", false);
}

export function invalidArguments(message: string, details: string[] = []): ContextToolError {
  return { code: "INVALID_ARGUMENTS", message, details: normalize(details), retryable: false };
}

function diagnostic(code: ContextToolError["code"], message: string, retryable: boolean): ContextToolError {
  return { code, message, details: [message], retryable };
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
