import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizeToolOutput } from "../output-sanitizer.js";
import { runCommandGuard } from "./command-guard.js";
import { createSidecarRecorder, type OpenCodeSidecarRuntimeContext } from "./events.js";
import { exitCodeFromOutput, hashText, outputText, stableJson, toolKey } from "./evidence.js";
import { createIdleVerifier } from "./idle-verify.js";
import { normalizeToolExecuteAfter, normalizeToolExecuteBefore } from "./hook-input.js";
import { commandFromTool, pathsFromTool } from "./paths.js";
import { currentSidecarWorkingTreeHash } from "./worktree-hash.js";

export async function OpenCodePlusPlusSidecar(context: OpenCodeSidecarRuntimeContext): Promise<Record<string, unknown>> {
  return createOpenCodePlusPlusSidecar(context);
}

export async function createOpenCodePlusPlusSidecar(context: OpenCodeSidecarRuntimeContext): Promise<Record<string, unknown>> {
  const recorder = createSidecarRecorder(context);
  const idle = createIdleVerifier(context.directory, recorder);
  const toolStarts = new Map<string, { startedAt: string; workingTreeHashBefore: string }>();

  function rememberToolStart(tool: unknown, args: unknown, callId?: string): void {
    toolStarts.set(hookKey(tool, args, callId), {
      startedAt: new Date().toISOString(),
      workingTreeHashBefore: currentSidecarWorkingTreeHash(context.directory)
    });
  }

  function recordToolAfter(input: unknown, output: unknown): void {
    try {
      const normalized = normalizeToolExecuteAfter(input, output);
      const tool = normalized.tool;
      const args = normalized.args;
      const command = commandFromTool(tool, args);
      const paths = pathsFromTool(args);
      const key = hookKey(tool, args, normalized.callId);
      const started = toolStarts.get(key) ?? {
        startedAt: new Date().toISOString(),
        workingTreeHashBefore: currentSidecarWorkingTreeHash(context.directory)
      };
      toolStarts.delete(key);

      const finishedAt = new Date().toISOString();
      const exitCode = exitCodeFromOutput(output);
      const sessionId = normalized.sessionId;
      const stdout = outputText(output, ["stdout", "output", "text"]);
      const stderr = outputText(output, ["stderr", "error"]);
      const stdoutEvidence = sanitizeToolOutput(stdout);
      const stderrEvidence = sanitizeToolOutput(stderr);
      const payload = {
        tool: String(tool),
        command,
        exitCode,
        startedAt: started.startedAt,
        finishedAt,
        workingTreeHashBefore: started.workingTreeHashBefore,
        workingTreeHashAfter: currentSidecarWorkingTreeHash(context.directory),
        sessionId: sessionId ? String(sessionId) : undefined,
        paths,
        stdoutHash: stdoutEvidence.hash,
        stdoutPreview: stdoutEvidence.preview,
        stdoutTruncated: stdoutEvidence.truncated,
        stdoutRedacted: stdoutEvidence.redacted,
        stderrHash: stderrEvidence.hash,
        stderrPreview: stderrEvidence.preview,
        stderrTruncated: stderrEvidence.truncated,
        stderrRedacted: stderrEvidence.redacted
      };
      const inputJson = writeToolEvidenceInput(context.directory, tool, args, payload);

      const cliArgs = ["sidecar", "record-tool", context.directory, "--json", "--input-json", inputJson];

      const recordResult = spawnSync("opencode-plusplus", cliArgs, {
        cwd: context.directory,
        encoding: "utf8",
        shell: process.platform === "win32",
        maxBuffer: 10 * 1024 * 1024
      });
      recorder.record("sidecar.record-tool", { tool, command, paths, exitCode: recordResult.status ?? 1 });
      if ((recordResult.status ?? 1) !== 0) {
        recorder.log("debug", "tool evidence record failed", { tool, command, status: recordResult.status ?? 1 });
      }
    } catch (error) {
      recorder.log("debug", "tool evidence record failed", { message: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    name: "opencode-plusplus-sidecar",
    "tool.execute.before": async (input: unknown, output: unknown) => {
      const normalized = normalizeToolExecuteBefore(input, output);
      rememberToolStart(normalized.tool, normalized.args, normalized.callId);
      runCommandGuard(context.directory, recorder, normalized.tool, normalized.args);
    },
    "tool.execute.after": async (input: unknown, output: unknown) => {
      recordToolAfter(input, output);
    },
    event: async ({ event }: { event?: Record<string, unknown> }) => {
      const eventRecord = event ?? {};
      const type = eventRecord.type;
      if (type === "session.created") {
        recorder.record("session.created");
        recorder.log("debug", "sidecar active", { directory: context.directory, worktree: context.worktree });
      }

      if (type === "file.edited") {
        const properties = eventRecord.properties && typeof eventRecord.properties === "object" ? (eventRecord.properties as Record<string, unknown>) : {};
        const file = properties.file ?? properties.path ?? eventRecord.file ?? eventRecord.path ?? "unknown";
        idle.markDirty("file.edited", { file });
      }

      if (type === "file.watcher.updated") {
        const properties = eventRecord.properties && typeof eventRecord.properties === "object" ? (eventRecord.properties as Record<string, unknown>) : {};
        const file = properties.file ?? properties.path ?? eventRecord.file ?? eventRecord.path ?? "unknown";
        idle.markDirty("file.watcher.updated", { file });
      }

      if (type === "session.idle") {
        recorder.record("session.idle");
        idle.maybeVerifyOnIdle();
      }
    }
  };
}

function hookKey(tool: unknown, args: unknown, callId?: string): string {
  return callId ? `call:${callId}` : toolKey(tool, args);
}

function writeToolEvidenceInput(directory: string, tool: unknown, args: unknown, payload: Record<string, unknown>): string {
  const dir = path.join(directory, ".agent-context", "traces", "tool-evidence");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `opencode-tool-${Date.now()}-${hashText(`${String(tool ?? "unknown")}:${stableJson(args)}`).slice(0, 12)}.json`);
  writeFileSync(file, `${JSON.stringify(payload)}\n`, "utf8");
  return file;
}
