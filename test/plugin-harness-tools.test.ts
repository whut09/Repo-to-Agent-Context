import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runGit } from "../src/core/git.js";
import { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "../src/integrations/opencode/plugin-runtime/harness/index.js";
import { pluginEvaluateStatePath } from "../src/integrations/opencode/plugin-runtime/harness/session.js";
import { createOpenCodePlusPlusSidecar } from "../src/integrations/opencode/plugin-runtime/index.js";
import type { PluginHarnessResult } from "../src/integrations/opencode/plugin-runtime/harness/types.js";

interface PluginHarnessTool {
  description: string;
  execute: (args?: unknown) => Promise<string>;
}

function result(text: string): PluginHarnessResult {
  return JSON.parse(text) as PluginHarnessResult;
}

test("OpenCode plugin exposes in-process harness tools without spawning a CLI", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-tools-"));
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "state.json") });
    const tools = plugin.tool as Record<string, PluginHarnessTool>;
    assert.deepEqual(Object.keys(tools).sort(), [...OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES].sort());
    assert.match(tools.opencode_plusplus_prepare.description, /before editing/i);
    assert.match(tools.opencode_plusplus_evaluate.description, /after edits/i);
    assert.match(tools.opencode_plusplus_next.description, /do not claim/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepare is idempotent, task state is isolated, and next consumes current evaluate", async () => {
  const root = createPluginHarnessRepo();
  const stateFile = path.join(root, "state.json");
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile });
    const tools = plugin.tool as Record<string, PluginHarnessTool>;
    const first = result(await tools.opencode_plusplus_prepare.execute({ task: "fix login timeout bug", type: "bugfix", sessionId: "session-a" }));
    const second = result(await tools.opencode_plusplus_prepare.execute({ task: "fix login timeout bug", type: "bugfix", sessionId: "session-a" }));
    assert.equal(first.taskId, "fix-login-timeout-bug");
    assert.equal(second.taskId, first.taskId);
    assert.equal(second.sessionId, "session-a");
    assert.equal(second.taskIdSource, "created");
    assert.equal(second.nextAction, "evaluate");
    assert.equal(second.blocking, true);
    assert.equal(first.artifacts.sort().join("\n"), second.artifacts.sort().join("\n"));

    const other = result(await tools.opencode_plusplus_prepare.execute({ task: "add audit logging", type: "feature", sessionId: "session-b" }));
    assert.equal(other.taskId, "add-audit-logging");
    assert.notEqual(other.taskId, first.taskId);
    assert.equal(other.sessionId, "session-b");

    const evaluated = result(await tools.opencode_plusplus_evaluate.execute({ taskId: first.taskId, sessionId: "session-a" }));
    assert.equal(evaluated.taskId, first.taskId);
    assert.equal(evaluated.sessionId, "session-a");
    assert.match(evaluated.workingTreeHash, /^[a-f0-9]{64}$/);
    assert.equal(existsSync(pluginEvaluateStatePath(root)), true);

    const next = result(await tools.opencode_plusplus_next.execute({ taskId: first.taskId, sessionId: "session-a" }));
    assert.equal(next.taskId, first.taskId);
    assert.equal(next.nextAction === "finalize", next.blocking === false);
    if (next.blocking) assert.notEqual(next.nextAction, "finalize");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("evaluate reads the current working tree and next requires a matching evaluate", async () => {
  const root = createPluginHarnessRepo();
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "state.json") });
    const tools = plugin.tool as Record<string, PluginHarnessTool>;
    const prepared = result(await tools.opencode_plusplus_prepare.execute({ task: "fix login timeout bug", sessionId: "session-current" }));
    const first = result(await tools.opencode_plusplus_evaluate.execute({ taskId: prepared.taskId }));
    writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'changed'; }\n", "utf8");
    const second = result(await tools.opencode_plusplus_evaluate.execute({ taskId: prepared.taskId }));
    assert.notEqual(first.workingTreeHash, second.workingTreeHash);
    assert.equal(second.sessionId, "session-current");

    const other = result(await tools.opencode_plusplus_prepare.execute({ task: "add audit logging", sessionId: "session-other" }));
    const missing = result(await tools.opencode_plusplus_next.execute({ taskId: other.taskId }));
    assert.equal(missing.ok, false);
    assert.equal(missing.error?.code, "HARNESS_ERROR");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed args and tool failures return structured errors instead of throwing", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-harness-error-"));
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "state.json") });
    const tools = plugin.tool as Record<string, PluginHarnessTool>;
    const malformed = result(await tools.opencode_plusplus_prepare.execute({ type: "bugfix" }));
    assert.equal(malformed.ok, false);
    assert.equal(malformed.error?.code, "HARNESS_ERROR");
    assert.equal(malformed.blocking, true);
    const failed = result(await tools.opencode_plusplus_evaluate.execute({ taskId: "missing" }));
    assert.equal(failed.ok, false);
    assert.equal(failed.error?.code, "HARNESS_ERROR");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createPluginHarnessRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-harness-"));
  mkdirSync(path.join(root, "src", "auth"), { recursive: true });
  mkdirSync(path.join(root, "test", "auth"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test", check: "tsc --noEmit" } }), "utf8");
  writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function loginSession() { return 'ok'; }\n", "utf8");
  writeFileSync(path.join(root, "src", "auth", "middleware.ts"), "import { loginSession } from './session.js';\nexport function authMiddleware() { return loginSession(); }\n", "utf8");
  writeFileSync(path.join(root, "test", "auth", "session.test.ts"), "import { loginSession } from '../../src/auth/session.js';\nloginSession();\n", "utf8");
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(root, ["config", "user.name", "OpenCode Plus Plus"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  return root;
}
