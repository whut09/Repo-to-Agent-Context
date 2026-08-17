export interface NormalizedToolHookInput {
  tool: unknown;
  args: unknown;
  callId?: string;
  sessionId?: string;
}

export function normalizeToolExecuteBefore(input: unknown, output: unknown): NormalizedToolHookInput {
  const inputRecord = record(input);
  const outputRecord = record(output);
  return normalizeToolHookInput(inputRecord, outputRecord);
}

export function normalizeToolExecuteAfter(input: unknown, output: unknown): NormalizedToolHookInput {
  const inputRecord = record(input);
  const outputRecord = record(output);
  return normalizeToolHookInput(inputRecord, outputRecord);
}

function normalizeToolHookInput(input: Record<string, unknown>, output: Record<string, unknown>): NormalizedToolHookInput {
  const tool = input.tool ?? input.name ?? "unknown";
  const args = output.args ?? output.arguments ?? input.args ?? input.arguments ?? {};
  const callId = stringValue(input.callID ?? input.callId ?? output.callID ?? output.callId);
  const sessionId = stringValue(input.sessionID ?? input.sessionId ?? output.sessionID ?? output.sessionId);
  return { tool, args, callId, sessionId };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
