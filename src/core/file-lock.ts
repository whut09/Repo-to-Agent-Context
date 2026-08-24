import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";

export interface FileLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export interface FileLockMetadata {
  schemaVersion: 1;
  pid: number;
  ownerToken: string;
  createdAt: string;
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
      const metadata: FileLockMetadata = { schemaVersion: 1, pid: process.pid, ownerToken, createdAt: new Date().toISOString() };
      writeSync(descriptor, JSON.stringify(metadata), 0, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const lockStat = statSync(lockPath);
        if (Date.now() - lockStat.mtimeMs > staleMs && canRecoverStaleLock(lockPath)) unlinkSync(lockPath);
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

export function cleanupStaleLock(lockPath: string, staleMs = 120_000): boolean {
  if (!existsSync(lockPath)) return false;
  try {
    if (Date.now() - statSync(lockPath).mtimeMs <= staleMs || !canRecoverStaleLock(lockPath)) return false;
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function canRecoverStaleLock(lockPath: string): boolean {
  try {
    const metadata = JSON.parse(readFileSync(lockPath, "utf8")) as Partial<FileLockMetadata>;
    if (typeof metadata.pid !== "number") return true;
    if (metadata.pid === process.pid) return false;
    process.kill(metadata.pid, 0);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ESRCH" || code === "ENOENT" || code === "EPERM";
  }
}

export function cleanupAtomicTempFiles(targetPath: string, staleMs = 120_000): void {
  const directory = path.dirname(targetPath);
  const prefix = `${path.basename(targetPath)}.tmp-`;
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    if (entry.startsWith(prefix)) {
      try {
        const temporaryPath = path.join(directory, entry);
        if (Date.now() - statSync(temporaryPath).mtimeMs > staleMs) unlinkSync(temporaryPath);
      } catch {
        // Best-effort cleanup; an active writer owns its temp file.
      }
    }
  }
}
