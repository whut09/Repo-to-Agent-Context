import { sanitizeToolOutput } from "../output-sanitizer.js";
import { recordOpencodeSidecarTool } from "../sidecar.js";
import { runCommandGuard } from "./command-guard.js";
import { createSidecarRecorder, type OpenCodeSidecarRuntimeContext } from "./events.js";
import { exitCodeFromOutput, outputText, toolKey } from "./evidence.js";
import { createIdleVerifier } from "./idle-verify.js";
import { normalizeToolExecuteAfter, normalizeToolExecuteBefore } from "./hook-input.js";
import { commandFromTool, pathsFromTool } from "./paths.js";
import {
  defaultOpenCodePlusPlusStateFile,
  readOpenCodePlusPlusPluginStatus,
  renderOpenCodePlusPlusPluginStatus,
  setOpenCodePlusPlusPluginEnabled
} from "./state.js";
import { currentSidecarWorkingTreeHash } from "./worktree-hash.js";

export interface OpenCodePlusPlusSidecarOptions {
  stateFile?: string;
  pluginPath?: string;
  pluginInstalled?: boolean;
}

export async function OpenCodePlusPlusSidecar(context: OpenCodeSidecarRuntimeContext): Promise<Record<string, unknown>> {
  return createOpenCodePlusPlusSidecar(context);
}

export async function createOpenCodePlusPlusSidecar(
  context: OpenCodeSidecarRuntimeContext,
  options: OpenCodePlusPlusSidecarOptions = {}
): Promise<Record<string, unknown>> {
  const recorder = createSidecarRecorder(context);
  const stateFile = options.stateFile ?? defaultOpenCodePlusPlusStateFile();
  const idle = createIdleVerifier(context.directory, recorder, 2000, options.pluginPath, options.pluginInstalled);
  const toolStarts = new Map<string, { startedAt: string; workingTreeHashBefore: string }>();

  function enabled(): boolean {
    return readOpenCodePlusPlusPluginStatus(stateFile).enabled;
  }

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
        command: command ?? undefined,
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
      recordOpencodeSidecarTool(context.directory, payload);
      recorder.record("sidecar.record-tool", { tool, command, paths, exitCode: 0 });
    } catch (error) {
      recorder.log("debug", "tool evidence record failed", { message: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    name: "opencode-plusplus-sidecar",
    tool: {
      opencode_plusplus_enable: controlTool("Enable OpenCode++ guards and evidence capture.", () => setOpenCodePlusPlusPluginEnabled(true, stateFile)),
      opencode_plusplus_disable: controlTool("Disable OpenCode++ guards and evidence capture.", () => setOpenCodePlusPlusPluginEnabled(false, stateFile)),
      opencode_plusplus_status: controlTool("Show OpenCode++ installation and enabled status.", () => readOpenCodePlusPlusPluginStatus(stateFile))
    },
    "tool.execute.before": async (input: unknown, output: unknown) => {
      if (!enabled()) return;
      const normalized = normalizeToolExecuteBefore(input, output);
      rememberToolStart(normalized.tool, normalized.args, normalized.callId);
      runCommandGuard(context.directory, recorder, normalized.tool, normalized.args);
    },
    "tool.execute.after": async (input: unknown, output: unknown) => {
      if (!enabled()) return;
      recordToolAfter(input, output);
    },
    event: async ({ event }: { event?: Record<string, unknown> }) => {
      const eventRecord = event ?? {};
      const type = eventRecord.type;
      if (type === "session.created") {
        recorder.record("session.created", { enabled: enabled() });
        recorder.log("debug", "sidecar active", { directory: context.directory, worktree: context.worktree });
      }

      if (!enabled()) return;

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
        await idle.maybeVerifyOnIdle();
      }
    }
  };
}

function controlTool(description: string, action: () => ReturnType<typeof readOpenCodePlusPlusPluginStatus>): Record<string, unknown> {
  return {
    description,
    args: {},
    async execute(): Promise<string> {
      return renderOpenCodePlusPlusPluginStatus(action());
    }
  };
}

function hookKey(tool: unknown, args: unknown, callId?: string): string {
  return callId ? `call:${callId}` : toolKey(tool, args);
}
