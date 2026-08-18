import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runGit } from "../src/core/git.js";
import { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "../src/integrations/opencode/plugin-runtime/harness/index.js";
import { createOpenCodePlusPlusSidecar } from "../src/integrations/opencode/plugin-runtime/index.js";

interface PluginHarnessTool {
  description: string;
  execute: (args?: unknown) => Promise<string>;
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

test("prepare, evaluate, and next return the harness contract and stay available when disabled", async () => {
  const root = createPluginHarnessRepo();
  const stateFile = path.join(root, "state.json");
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile });
    const tools = plugin.tool as Record<string, PluginHarnessTool>;
    await tools.opencode_plusplus_disable.execute();
    assert.match(await tools.opencode_plusplus_status.execute(), /Enabled: no/);

    const missing = await tools.opencode_plusplus_evaluate.execute({});
    assert.match(missing, /evaluate failed/);
    assert.match(missing, /prepare/);

    const prepared = await tools.opencode_plusplus_prepare.execute({ task: "fix login timeout bug", type: "bugfix" });
    assert.match(prepared, /taskId: fix-login-timeout-bug/);
    assert.match(prepared, /mustInspect:/);
    assert.match(prepared, /allowedEditGlobs:/);
    assert.match(prepared, /avoidEditGlobs:/);
    assert.match(prepared, /requiredCommands:/);
    assert.match(prepared, /next:/);
    assert.equal(existsSync(path.join(root, ".agent-context", "runs", "fix-login-timeout-bug", "run.json")), true);

    const retrieved = await tools.opencode_plusplus_retrieve.execute({ task: "fix login timeout bug", topK: 4 });
    assert.match(retrieved, /hits:/);

    const evaluated = await tools.opencode_plusplus_evaluate.execute({ taskId: "fix-login-timeout-bug" });
    assert.match(evaluated, /blocking:/);
    assert.match(evaluated, /decision:/);
    assert.match(evaluated, /missingEvidence:/);

    const next = await tools.opencode_plusplus_next.execute({ taskId: "fix-login-timeout-bug" });
    assert.match(next, /nextAction:/);
    if (!/nextAction: ready-for-review/.test(next) && !/nextAction: finalize/.test(next)) {
      assert.match(next, /不得声称任务完成/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harness tools return structured text instead of throwing", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-harness-error-"));
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "state.json") });
    const tools = plugin.tool as Record<string, PluginHarnessTool>;
    const result = await tools.opencode_plusplus_prepare.execute({ type: "bugfix" });
    assert.match(result, /prepare failed/);
    assert.match(result, /non-empty task/);
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
  writeFileSync(
    path.join(root, "src", "auth", "middleware.ts"),
    "import { loginSession } from './session.js';\nexport function authMiddleware() { return loginSession(); }\n",
    "utf8"
  );
  writeFileSync(path.join(root, "test", "auth", "session.test.ts"), "import { loginSession } from '../../src/auth/session.js';\nloginSession();\n", "utf8");
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(root, ["config", "user.name", "OpenCode Plus Plus"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  return root;
}
