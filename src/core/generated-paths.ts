export function isGeneratedContextPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized === "AGENTS.md" || normalized.startsWith(".agent-context/");
}

export function isGeneratedCachePath(filePath: string): boolean {
  return filePath.replace(/\\/g, "/").startsWith(".agent-context/cache/");
}

export function isHarnessGeneratedPath(filePath: string): boolean {
  return isGeneratedContextPath(filePath);
}
