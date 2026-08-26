export const CONTEXT_TOOLS_SCHEMA_VERSION = "opencode-plusplus.context-tools.v1" as const;

export type ContextToolName = "context-search" | "context-get" | "context-status" | "interventions" | "context-feedback";

export type ContextToolErrorCode =
  | "INVALID_ARGUMENTS"
  | "INVALID_PATH"
  | "ENTRY_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "NETWORK_FAILURE"
  | "REGISTRY_INVALID"
  | "STATE_CORRUPT"
  | "INTERNAL_ERROR";

export interface ContextToolError {
  code: ContextToolErrorCode;
  message: string;
  details: string[];
  retryable: boolean;
}

export interface ContextToolSuccess<T> {
  schemaVersion: typeof CONTEXT_TOOLS_SCHEMA_VERSION;
  ok: true;
  tool: ContextToolName;
  data: T;
}

export interface ContextToolFailure {
  schemaVersion: typeof CONTEXT_TOOLS_SCHEMA_VERSION;
  ok: false;
  tool: ContextToolName;
  error: ContextToolError;
}

export type ContextToolResult<T> = ContextToolSuccess<T> | ContextToolFailure;

export function contextToolSuccess<T>(tool: ContextToolName, data: T): ContextToolSuccess<T> {
  return { schemaVersion: CONTEXT_TOOLS_SCHEMA_VERSION, ok: true, tool, data };
}

export function contextToolFailure(tool: ContextToolName, error: ContextToolError): ContextToolFailure {
  return { schemaVersion: CONTEXT_TOOLS_SCHEMA_VERSION, ok: false, tool, error };
}
