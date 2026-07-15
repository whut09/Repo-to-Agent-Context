import { readJsonDiagnostic, writeJsonAtomic as writeAtomicJson } from "./atomic-store.js";

export function readJsonFile<T>(filePath: string): T | null {
  const result = readJsonDiagnostic<T>(filePath);
  if (result.status === "missing") return null;
  if (result.status === "corrupt") throw new Error(`Unable to read JSON file ${filePath}: ${result.error}`);
  return result.value;
}

export function writeJsonAtomic<T>(filePath: string, value: T): void {
  writeAtomicJson(filePath, value as object);
}
