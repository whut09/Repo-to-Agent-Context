import { createHash } from "node:crypto";

export function hashText(text: unknown): string {
  return createHash("sha256")
    .update(String(text ?? ""))
    .digest("hex");
}

export function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

export function toolKey(tool: unknown, args: unknown): string {
  return `${String(tool ?? "unknown")}:${hashText(stableJson(args))}`;
}

export function outputText(output: unknown, keys: string[]): string {
  if (!output || typeof output !== "object") return "";
  const record = output as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object" ? (record.properties as Record<string, unknown>) : {};
  for (const key of keys) {
    const value = record[key] ?? properties[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export function exitCodeFromOutput(output: unknown): number | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object" ? (record.properties as Record<string, unknown>) : {};
  const metadata = record.metadata && typeof record.metadata === "object" ? (record.metadata as Record<string, unknown>) : {};
  for (const key of ["exitCode", "exit", "status", "code"]) {
    const value = record[key] ?? properties[key] ?? metadata[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  }
  return null;
}
