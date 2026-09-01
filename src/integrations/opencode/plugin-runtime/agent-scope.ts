export function normalizeOpenCodeAgent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "");
  return normalized || undefined;
}

export function isOpenCodePlusPlusAgent(value: unknown): boolean {
  const normalized = normalizeOpenCodeAgent(value);
  return normalized === "opencode-plusplus" || normalized === "opencode++";
}
