export function harnessFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const text = String(error).trim();
  return text || "Unknown harness error.";
}
