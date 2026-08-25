export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Cannot serialize a non-finite number.");
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error(`Cannot serialize value of type ${typeof value}.`);
  return serialized;
}

export function serializeContextValue(value: unknown): string {
  return `${stableStringify(value)}\n`;
}
