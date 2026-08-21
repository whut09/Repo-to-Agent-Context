import { sanitizeToolOutput } from "../output-sanitizer.js";
import { recordOpencodeSidecarTool } from "../sidecar.js";
import { runCommandGuard } from "./command-guard.js";
import { createSidecarRecorder, type OpenCodeSidecarRuntimeContext } from "./events.js";
import { exitCodeFromOutput, outputText, toolKey } from "./evidence.js";
import { executeEvaluateTool, executeNextTool, executePrepareTool, executeRetrieveTool } from "./harness/index.js";
import { createIdleVerifier } from "./idle-verify.js";
import { normalizeToolExecuteAfter, normalizeToolExecuteBefore } from "./hook-input.js";
import { commandFromTool, pathsFromTool } from "./paths.js";
import { createSessionLifecycle } from "./session-lifecycle.js";
import { initializeWorkflowState, readWorkflowState, updateWorkflowState } from "./harness/workflow.js";
import {
  defaultOpenCodePlusPlusStateFile,
  readOpenCodePlusPlusPluginStatus,
  renderOpenCodePlusPlusPluginStatus,
  setOpenCodePlusPlusPluginEnabled
} from "./state.js";
import { currentSidecarWorkingTreeHash } from "./worktree-hash.js";

export { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "./harness/index.js";

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

  const lifecycle = createSessionLifecycle({
    directory: context.directory,
    context,
    recorder,
    idle,
    isEnabled: enabled
  });

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
        taskId: sessionId ? (readWorkflowState(context.directory, String(sessionId))?.taskId ?? undefined) : undefined,
        source: "desktop-hook" as const,
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
      opencode_plusplus_status: controlTool("Show OpenCode++ installation and enabled status.", () => readOpenCodePlusPlusPluginStatus(stateFile)),
      opencode_plusplus_prepare: harnessTool(
        "Call before editing. Builds repository context if missing and returns taskId, mustInspect, edit boundaries, and requiredCommands.",
        { task: { type: "string" }, type: { type: "string" }, sessionId: { type: "string" } },
        (args) => executePrepareTool(context.directory, args)
      ),
      opencode_plusplus_retrieve: harnessTool(
        "Call to find task-relevant files without blind search. Returns ranked paths, scores, and a short reason.",
        { task: { type: "string" }, topK: { type: "number" }, sessionId: { type: "string" } },
        (args) => executeRetrieveTool(context.directory, args)
      ),
      opencode_plusplus_evaluate: harnessTool(
        "Call after edits or before claiming done. Returns blocking, findings, decision, and missing evidence.",
        { taskId: { type: "string" }, sessionId: { type: "string" } },
        (args) => executeEvaluateTool(context.directory, args)
      ),
      opencode_plusplus_next: harnessTool(
        "Call to get the next harness action. If nextAction is not finalize, do not claim the task is complete.",
        { taskId: { type: "string" }, sessionId: { type: "string" } },
        (args) => executeNextTool(context.directory, args)
      )
    },
    "tool.execute.before": async (input: unknown, output: unknown) => {
      if (!enabled()) return;
      const normalized = normalizeToolExecuteBefore(input, output);
      const sessionId = normalized.sessionId ?? "default";
      const workflow = initializeWorkflowState(context.directory, sessionId);
      if (normalized.tool !== "shell" && workflow.sourceChanged && !workflow.taskId) {
        throw new Error("OpenCode++ requires opencode_plusplus_prepare before source edits.");
      }
      updateWorkflowState(context.directory, sessionId, {
        phase: workflow.taskId ? "editing" : workflow.phase,
        eventKey: `tool:${normalized.callId ?? toolKey(normalized.tool, normalized.args)}`
      });
      rememberToolStart(normalized.tool, normalized.args, normalized.callId);
      runCommandGuard(context.directory, recorder, normalized.tool, normalized.args);
    },
    "tool.execute.after": async (input: unknown, output: unknown) => {
      if (!enabled()) return;
      recordToolAfter(input, output);
    },
    "experimental.session.compacting": async (input: unknown, output: unknown) => {
      lifecycle.onSessionCompacting(input, output);
    },
    event: async ({ event }: { event?: Record<string, unknown> }) => {
      const eventRecord = event ?? {};
      const type = eventRecord.type;
      if (type === "session.created") {
        const sessionId = String(eventRecord.sessionID ?? eventRecord.sessionId ?? "default");
        initializeWorkflowState(context.directory, sessionId);
        lifecycle.onSessionCreated();
        return;
      }

      if (!enabled()) return;

      if (type === "file.edited") {
        const properties = eventRecord.properties && typeof eventRecord.properties === "object" ? (eventRecord.properties as Record<string, unknown>) : {};
        const file = properties.file ?? properties.path ?? eventRecord.file ?? eventRecord.path ?? "unknown";
        const sessionId = String(eventRecord.sessionID ?? eventRecord.sessionId ?? "default");
        const workflow = initializeWorkflowState(context.directory, sessionId);
        updateWorkflowState(context.directory, sessionId, { phase: "editing", taskId: workflow.taskId, eventKey: `file.edited:${file}` });
        idle.markDirty("file.edited", { file });
      }

      if (type === "file.watcher.updated") {
        const properties = eventRecord.properties && typeof eventRecord.properties === "object" ? (eventRecord.properties as Record<string, unknown>) : {};
        const file = properties.file ?? properties.path ?? eventRecord.file ?? eventRecord.path ?? "unknown";
        const sessionId = String(eventRecord.sessionID ?? eventRecord.sessionId ?? "default");
        const workflow = initializeWorkflowState(context.directory, sessionId);
        if (!workflow.taskId) throw new Error("OpenCode++ requires opencode_plusplus_prepare before source edits.");
        updateWorkflowState(context.directory, sessionId, { phase: "editing", taskId: workflow.taskId, eventKey: `file.watcher.updated:${file}` });
        idle.markDirty("file.watcher.updated", { file });
      }

      if (type === "session.idle") {
        const sessionId = String(eventRecord.sessionID ?? eventRecord.sessionId ?? "default");
        updateWorkflowState(context.directory, sessionId, { eventKey: `session.idle:${sessionId}` });
        recorder.record("session.idle");
        const verify = await idle.maybeVerifyOnIdle();
        lifecycle.onSessionIdle(verify);
      }

      if (type === "session.error") {
        lifecycle.onSessionError(eventRecord);
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

function harnessTool(description: string, args: Record<string, { type: string }>, execute: (input: unknown) => Promise<string>): Record<string, unknown> {
  return {
    description,
    args,
    async execute(input: unknown = {}): Promise<string> {
      return execute(input);
    }
  };
}

function hookKey(tool: unknown, args: unknown, callId?: string): string {
  return callId ? `call:${callId}` : toolKey(tool, args);
}
