import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { cleanupAtomicTempFiles, withFileLock, type FileLockOptions } from "./file-lock.js";

export interface JsonReadSuccess<T> {
  status: "ok";
  value: T;
}
export interface JsonReadMissing {
  status: "missing";
  filePath: string;
}
export interface JsonReadCorrupt {
  status: "corrupt";
  filePath: string;
  error: string;
}
export type JsonReadResult<T> = JsonReadSuccess<T> | JsonReadMissing | JsonReadCorrupt;

export interface JsonlAppendResult {
  appended: boolean;
  sequence: number;
}

export class RevisionConflictError extends Error {
  constructor(
    readonly filePath: string,
    readonly expectedRevision: number,
    readonly actualRevision: number
  ) {
    super(`Revision conflict for ${filePath}: expected ${expectedRevision}, found ${actualRevision}.`);
  }
}

export interface AtomicWriteOptions extends FileLockOptions {
  beforeRename?: (temporaryPath: string, filePath: string) => void;
}

export function readJsonDiagnostic<T>(filePath: string): JsonReadResult<T> {
  if (!existsSync(filePath)) return { status: "missing", filePath };
  try {
    return { status: "ok", value: JSON.parse(readFileSync(filePath, "utf8")) as T };
  } catch (error) {
    return { status: "corrupt", filePath, error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeTextAtomic(filePath: string, content: string, options: AtomicWriteOptions = {}): void {
  withFileLock(filePath, () => writeTextAtomicUnlocked(filePath, content, options), options);
}

export function writeJsonAtomic<T extends object>(filePath: string, value: T, options: AtomicWriteOptions = {}): void {
  withFileLock(filePath, () => writeTextAtomicUnlocked(filePath, `${JSON.stringify(value, null, 2)}\n`, options), options);
}

export function appendTextLocked(filePath: string, content: string, options: FileLockOptions = {}): void {
  withFileLock(
    filePath,
    () => {
      mkdirSync(path.dirname(filePath), { recursive: true });
      const descriptor = openSync(filePath, "a");
      try {
        const buffer = Buffer.from(content, "utf8");
        let offset = 0;
        while (offset < buffer.length) offset += writeSync(descriptor, buffer, offset, buffer.length - offset);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    },
    options
  );
}

export function appendJsonLineLocked<T extends { eventId: string; sequence?: number }>(
  filePath: string,
  value: T,
  options: FileLockOptions = {}
): JsonlAppendResult {
  return withFileLock(
    filePath,
    () => {
      mkdirSync(path.dirname(filePath), { recursive: true });
      let sequence = 0;
      if (existsSync(filePath)) {
        const lines = readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          let existing: Partial<T>;
          try {
            existing = JSON.parse(line) as Partial<T>;
          } catch (error) {
            throw new Error(`Unable to read JSONL event log ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
          }
          if (existing.eventId === value.eventId) return { appended: false, sequence: Number(existing.sequence ?? 0) };
          sequence = Math.max(sequence, Number(existing.sequence ?? 0));
        }
      }
      const next = { ...value, sequence: sequence + 1 } as T;
      const descriptor = openSync(filePath, "a");
      try {
        const content = `${JSON.stringify(next)}\n`;
        const buffer = Buffer.from(content, "utf8");
        let offset = 0;
        while (offset < buffer.length) offset += writeSync(descriptor, buffer, offset, buffer.length - offset);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      return { appended: true, sequence: next.sequence ?? sequence + 1 };
    },
    options
  );
}

export function updateJsonAtomic<T extends object>(filePath: string, update: (current: T | null) => T, options: FileLockOptions = {}): T {
  return withFileLock(
    filePath,
    () => {
      const current = readJsonDiagnostic<T>(filePath);
      if (current.status === "corrupt") throw new Error(`Unable to update corrupt JSON file ${filePath}: ${current.error}`);
      const value = update(current.status === "ok" ? current.value : null);
      writeTextAtomicUnlocked(filePath, `${JSON.stringify(value, null, 2)}\n`);
      return value;
    },
    options
  );
}

export function writeJsonAtomicWithRevision<T extends { revision?: number }>(
  filePath: string,
  value: T,
  expectedRevision?: number,
  options: FileLockOptions = {}
): T {
  return withFileLock(
    filePath,
    () => {
      const current = readJsonDiagnostic<T>(filePath);
      if (current.status === "corrupt") throw new Error(`Unable to update corrupt JSON file ${filePath}: ${current.error}`);
      const actualRevision = current.status === "ok" && typeof current.value.revision === "number" ? current.value.revision : 0;
      if (expectedRevision !== undefined && expectedRevision !== actualRevision) {
        throw new RevisionConflictError(filePath, expectedRevision, actualRevision);
      }
      const next = { ...value, revision: actualRevision + 1 } as T;
      writeTextAtomicUnlocked(filePath, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    },
    options
  );
}

function writeTextAtomicUnlocked(filePath: string, content: string, options: AtomicWriteOptions = {}): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  cleanupAtomicTempFiles(filePath);
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx");
    const buffer = Buffer.from(content, "utf8");
    let offset = 0;
    while (offset < buffer.length) offset += writeSync(descriptor, buffer, offset, buffer.length - offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    options.beforeRename?.(temporaryPath, filePath);
    replaceFile(temporaryPath, filePath);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch {
      /* already renamed or absent */
    }
  }
}

function replaceFile(temporaryPath: string, filePath: string): void {
  try {
    renameSync(temporaryPath, filePath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!existsSync(filePath) || !["EEXIST", "EPERM", "EACCES"].includes(code ?? "")) throw error;
  }
  const backupPath = `${filePath}.bak-${process.pid}-${Date.now()}`;
  renameSync(filePath, backupPath);
  try {
    renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      renameSync(backupPath, filePath);
    } catch {
      /* preserve original failure */
    }
    throw error;
  }
  try {
    unlinkSync(backupPath);
  } catch {
    /* a later cleanup may remove the backup */
  }
}
