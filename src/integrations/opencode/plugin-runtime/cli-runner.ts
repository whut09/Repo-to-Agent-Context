import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface OpenCodePlusPlusCliRunOptions {
  maxBuffer?: number;
  runtimeExecutable?: string;
  cliEntrypoint?: string;
}

export interface OpenCodePlusPlusCliRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export function runOpenCodePlusPlusCli(args: string[], cwd: string, options: OpenCodePlusPlusCliRunOptions = {}): OpenCodePlusPlusCliRunResult {
  const runtimeExecutable = options.runtimeExecutable ?? nodeExecutable();
  const cliEntrypoint = options.cliEntrypoint ?? fileURLToPath(new URL("../../../cli/index.js", import.meta.url));
  const result = spawnSync(runtimeExecutable, [cliEntrypoint, ...args], {
    cwd,
    shell: false,
    encoding: "utf8",
    maxBuffer: options.maxBuffer
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
}

function nodeExecutable(): string {
  return /^node(?:\.exe)?$/i.test(path.basename(process.execPath)) ? process.execPath : "node";
}
