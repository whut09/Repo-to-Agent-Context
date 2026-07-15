export interface TaskSlugOptions {
  maxLength?: number;
  fallback?: string;
}

export function taskSlug(task: string, options: TaskSlugOptions = {}): string {
  const normalized = normalizedTaskSlug(task, options.maxLength ?? 56);
  return normalized || options.fallback || `task-${hashTask(task)}`;
}

export function hashTask(task: string): string {
  let hash = 0;
  for (const char of task) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
}

export function traceIdForTask(task: string): string {
  return normalizedTaskSlug(task, 56) || `trace-${hashTask(task)}`;
}

function normalizedTaskSlug(task: string, maxLength: number): string {
  return task
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}
