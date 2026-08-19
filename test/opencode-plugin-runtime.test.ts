import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createOpenCodePlusPlusSidecar } from "../src/integrations/opencode/plugin-runtime/index.js";
import { runOpenCodePlusPlusCli } from "../src/integrations/opencode/plugin-runtime/cli-runner.js";
import { exitCodeFromOutput } from "../src/integrations/opencode/plugin-runtime/evidence.js";
import { normalizeToolExecuteAfter, normalizeToolExecuteBefore } from "../src/integrations/opencode/plugin-runtime/hook-input.js";

test("OpenCode plugin normalizes current before hook arguments", () => {
  const result = normalizeToolExecuteBefore(
    { tool: "shell", sessionID: "session-1", callID: "call-1" },
    { args: { command: "npm test", description: "run tests" } }
  );

  assert.equal(result.tool, "shell");
  assert.deepEqual(result.args, { command: "npm test", description: "run tests" });
  assert.equal(result.sessionId, "session-1");
  assert.equal(result.callId, "call-1");
});

test("OpenCode plugin exposes persistent enable, disable, and status tools", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-state-"));
  const stateFile = path.join(root, "state.json");
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile });
    const tools = plugin.tool as Record<string, { execute: () => Promise<string> }>;

    assert.match(await tools.opencode_plusplus_status.execute(), /Enabled: yes/);
    assert.match(await tools.opencode_plusplus_disable.execute(), /Enabled: no/);
    assert.equal(existsSync(stateFile), true);
    assert.match(await tools.opencode_plusplus_status.execute(), /Enabled: no/);
    assert.match(await tools.opencode_plusplus_enable.execute(), /Enabled: yes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("disabled OpenCode plugin keeps controls available and skips command guards", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-disabled-"));
  const stateFile = path.join(root, "state.json");
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile });
    const tools = plugin.tool as Record<string, { execute: () => Promise<string> }>;
    await tools.opencode_plusplus_disable.execute();

    const before = plugin["tool.execute.before"] as (input: unknown, output: unknown) => Promise<void>;
    await before({ tool: "shell", callID: "call-1" }, { args: { command: "git reset --hard" } });
    assert.match(await tools.opencode_plusplus_status.execute(), /Enabled: no/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("enabled OpenCode plugin guard rejection tells the model what to run instead", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-guard-action-"));
  const stateFile = path.join(root, "state.json");
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile });
    const before = plugin["tool.execute.before"] as (input: unknown, output: unknown) => Promise<void>;

    await assert.rejects(before({ tool: "shell", callID: "call-1" }, { args: { command: "git reset --hard HEAD" } }), (error: Error) => {
      assert.match(error.message, /BLOCKED: Hard git reset/);
      assert.match(error.message, /Evidence: git reset --hard HEAD/);
      assert.match(error.message, /Do instead:/);
      return true;
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenCode plugin keeps compatibility with legacy before hook arguments", () => {
  const result = normalizeToolExecuteBefore({ tool: "write", args: { file: "src/index.ts" } }, undefined);

  assert.equal(result.tool, "write");
  assert.deepEqual(result.args, { file: "src/index.ts" });
  assert.equal(result.callId, undefined);
});

test("OpenCode plugin normalizes current after hook arguments and metadata", () => {
  const result = normalizeToolExecuteAfter(
    { tool: "shell", sessionID: "session-1", callID: "call-1", args: { command: "npm test" } },
    { output: "passed", metadata: { exit: 0 } }
  );

  assert.deepEqual(result.args, { command: "npm test" });
  assert.equal(result.sessionId, "session-1");
  assert.equal(result.callId, "call-1");
  assert.equal(exitCodeFromOutput({ output: "passed", metadata: { exit: 0 } }), 0);
});

test("OpenCode plugin CLI runner preserves arguments without shell interpretation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-cli-"));
  const cliEntrypoint = path.join(root, "fake cli with spaces.mjs");
  try {
    writeFileSync(cliEntrypoint, "console.log(JSON.stringify(process.argv.slice(2)));\n", "utf8");

    const args = ["sidecar", "check-command", "npm run check && echo unsafe"];
    const result = runOpenCodePlusPlusCli(args, root, { runtimeExecutable: process.execPath, cliEntrypoint });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(String(result.stdout).trim()), args);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
