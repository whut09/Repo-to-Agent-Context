import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";

export interface FileLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export class FileLockTimeoutError extends Error {
  constructor(
    readonly lockPath: string,
    timeoutMs: number
  ) {
    super(`Timed out acquiring file lock ${lockPath} after ${timeoutMs}ms.`);
  }
}

export function withFileLock<T>(targetPath: string, operation: () => T, options: FileLockOptions = {}): T {
  const lockPath = `${targetPath}.lock`;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retryMs = options.retryMs ?? 10;
  const staleMs = options.staleMs ?? 120_000;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  const ownerToken = `${process.pid}-${startedAt}-${Math.random().toString(16).slice(2)}`;
  let descriptor: number | undefined;
  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockPath, "wx");
      const metadata = JSON.stringify({ schemaVersion: 1, pid: process.pid, ownerToken, createdAt: new Date().toISOString() });
      writeSync(descriptor, metadata, 0, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) unlinkSync(lockPath);
      } catch {
        // Another process may have released or replaced the lock.
      }
      if (Date.now() - startedAt >= timeoutMs) throw new FileLockTimeoutError(lockPath, timeoutMs);
      const waitMs = Math.min(retryMs, Math.max(1, timeoutMs - (Date.now() - startedAt)));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  try {
    return operation();
  } finally {
    try {
      closeSync(descriptor);
    } finally {
      try {
        const metadata = JSON.parse(readFileSync(lockPath, "utf8")) as { ownerToken?: string };
        if (metadata.ownerToken === ownerToken) unlinkSync(lockPath);
      } catch {
        // The stale-lock cleaner or an owner recovery path may have removed it.
      }
    }
  }
}

export function cleanupAtomicTempFiles(targetPath: string): void {
  const directory = path.dirname(targetPath);
  const prefix = `${path.basename(targetPath)}.tmp-`;
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    if (entry.startsWith(prefix)) {
      try {
        unlinkSync(path.join(directory, entry));
      } catch {
        // Best-effort cleanup; an active writer owns its temp file.
      }
    }
  }
}
