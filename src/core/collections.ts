export function unique<T>(items: T[], filterEmpty = false): T[] {
  return [...new Set(filterEmpty ? items.filter(Boolean) : items)];
}

export function uniqueSorted(items: string[]): string[] {
  return unique(items.filter(Boolean)).sort((left, right) => left.localeCompare(right));
}
