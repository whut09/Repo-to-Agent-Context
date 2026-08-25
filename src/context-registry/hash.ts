import { createHash } from "node:crypto";
import { stableStringify } from "./serialization.js";

export function hashContextValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function hashContextText(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
