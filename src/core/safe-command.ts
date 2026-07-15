import { spawn, spawnSync } from "node:child_process";

export interface SafeCommandRunOptions {
  cwd: string;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
}

export interface SafeCommandRunResult {
  command: string;
  file: string;
  args: string[];
  stdout: string;
  stderr: string;
  status: number | null;
  error?: Error;
}

export function runSafeCommand(command: string, options: SafeCommandRunOptions): SafeCommandRunResult {
  const parsed = parseCommandLine(command);
  const result = runParsedCommand(parsed.file, parsed.args, options);
  const fallback = shouldTryWindowsCmdFallback(parsed.file, result.error) ? runWindowsCmdCommand(`${parsed.file}.cmd`, parsed.args, options) : undefined;
  const finalResult = fallback && !fallback.error && fallback.status !== null ? fallback : result;
  const file = fallback && !fallback.error ? `${parsed.file}.cmd` : parsed.file;
  const stdout = typeof finalResult.stdout === "string" ? finalResult.stdout : "";
  const rawStderr = typeof finalResult.stderr === "string" ? finalResult.stderr : "";
  const stderr = finalResult.error ? `${rawStderr}${rawStderr ? "\n" : ""}${finalResult.error.message}` : rawStderr;
  return {
    command,
    file,
    args: parsed.args,
    stdout,
    stderr,
    status: typeof finalResult.status === "number" ? finalResult.status : finalResult.error ? 1 : null,
    error: finalResult.error
  };
}

export async function runSafeCommandStreaming(command: string, options: SafeCommandRunOptions): Promise<SafeCommandRunResult> {
  const parsed = parseCommandLine(command);
  const result = await runParsedCommandStreaming(parsed.file, parsed.args, options);
  const fallback = shouldTryWindowsCmdFallback(parsed.file, result.error)
    ? await runWindowsCmdCommandStreaming(`${parsed.file}.cmd`, parsed.args, options)
    : undefined;
  const finalResult = fallback && !fallback.error && fallback.status !== null ? fallback : result;
  const file = fallback && !fallback.error ? `${parsed.file}.cmd` : parsed.file;
  const stderr = finalResult.error ? `${finalResult.stderr}${finalResult.stderr ? "\n" : ""}${finalResult.error.message}` : finalResult.stderr;
  return {
    command,
    file,
    args: parsed.args,
    stdout: finalResult.stdout,
    stderr,
    status: finalResult.error ? 1 : typeof finalResult.status === "number" ? finalResult.status : null,
    error: finalResult.error
  };
}

function runParsedCommand(file: string, args: string[], options: SafeCommandRunOptions): ReturnType<typeof spawnSync> {
  return spawnSync(file, args, {
    cwd: options.cwd,
    shell: false,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer,
    timeout: options.timeoutMs
  });
}

function runWindowsCmdCommand(file: string, args: string[], options: SafeCommandRunOptions): ReturnType<typeof spawnSync> {
  const command = [file, ...args].map(windowsCmdQuote).join(" ");
  return spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
    cwd: options.cwd,
    shell: false,
    windowsVerbatimArguments: true,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer,
    timeout: options.timeoutMs
  });
}

async function runParsedCommandStreaming(
  file: string,
  args: string[],
  options: SafeCommandRunOptions
): Promise<{ stdout: string; stderr: string; status: number | null; error?: Error }> {
  return runSpawnStreaming(file, args, options);
}

async function runWindowsCmdCommandStreaming(
  file: string,
  args: string[],
  options: SafeCommandRunOptions
): Promise<{ stdout: string; stderr: string; status: number | null; error?: Error }> {
  const command = [file, ...args].map(windowsCmdQuote).join(" ");
  return runSpawnStreaming("cmd.exe", ["/d", "/s", "/c", command], options, true);
}

async function runSpawnStreaming(
  file: string,
  args: string[],
  options: SafeCommandRunOptions,
  windowsVerbatimArguments = false
): Promise<{ stdout: string; stderr: string; status: number | null; error?: Error }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments
    });
    const encoding = options.encoding ?? "utf8";
    const maxBuffer = options.maxBuffer ?? 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let error: Error | undefined;
    let settled = false;
    let totalTimer: NodeJS.Timeout | undefined;
    let idleTimer: NodeJS.Timeout | undefined;

    const clearTimers = () => {
      if (totalTimer) clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      totalTimer = undefined;
      idleTimer = undefined;
    };

    const killWithTimeout = (timeoutError: Error) => {
      if (settled) return;
      error = timeoutError;
      stderr += `${stderr ? "\n" : ""}${timeoutError.message}\n`;
      options.onStderr?.(`${timeoutError.message}\n`);
      terminateChildProcess(child.pid);
    };

    const resetIdleTimer = () => {
      if (!options.idleTimeoutMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        killWithTimeout(new Error(`Command produced no output for ${options.idleTimeoutMs}ms.`));
      }, options.idleTimeoutMs);
    };

    if (options.timeoutMs) {
      totalTimer = setTimeout(() => {
        killWithTimeout(new Error(`Command exceeded timeout (${options.timeoutMs}ms).`));
      }, options.timeoutMs);
    }
    resetIdleTimer();

    child.stdout?.setEncoding(encoding);
    child.stderr?.setEncoding(encoding);

    child.stdout?.on("data", (chunk: string | Buffer) => {
      const text = chunk.toString();
      stdout += text;
      resetIdleTimer();
      options.onStdout?.(text);
      if (stdout.length + stderr.length > maxBuffer && !error) {
        error = new Error(`Command output exceeded maxBuffer (${maxBuffer} bytes).`);
        child.kill();
      }
    });

    child.stderr?.on("data", (chunk: string | Buffer) => {
      const text = chunk.toString();
      stderr += text;
      resetIdleTimer();
      options.onStderr?.(text);
      if (stdout.length + stderr.length > maxBuffer && !error) {
        error = new Error(`Command output exceeded maxBuffer (${maxBuffer} bytes).`);
        child.kill();
      }
    });

    child.once("error", (spawnError) => {
      error = spawnError;
    });

    child.once("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({ stdout, stderr, status, error });
    });
  });
}

function terminateChildProcess(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The process may already have exited.
    }
  }
}

function shouldTryWindowsCmdFallback(file: string, error: Error | undefined): boolean {
  if (process.platform !== "win32") return false;
  if (!error || !("code" in error) || (error as NodeJS.ErrnoException).code !== "ENOENT") return false;
  return !/\.(cmd|bat|exe|ps1)$/i.test(file);
}

function windowsCmdQuote(value: string): string {
  if (value && !/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replace(/(["^])/g, "^$1")}"`;
}

export function parseCommandLine(command: string): { file: string; args: string[] } {
  const argv = tokenizeCommandLine(command);
  if (argv.length === 0) {
    throw new Error("Command is empty.");
  }
  return { file: argv[0] ?? "", args: argv.slice(1) };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tokenizeCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      const next = command[index + 1] ?? "";
      if (next !== "'" && next !== '"' && next !== "\\" && (quote || !/\s/.test(next))) {
        current += char;
        continue;
      }
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    if (isShellControlOperator(char)) {
      throw new Error(`Unsupported shell control operator ${JSON.stringify(char)}. Pass a plain executable plus arguments.`);
    }

    current += char;
  }

  if (escaped) current += "\\";
  if (quote) throw new Error(`Unterminated ${quote} quote in command.`);
  if (current) tokens.push(current);
  return tokens;
}

function isShellControlOperator(char: string): boolean {
  return char === "|" || char === "&" || char === ";" || char === "<" || char === ">" || char === "`";
}
