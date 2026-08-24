import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  pluginHarnessSessionPath,
  readPluginHarnessSession,
  readPluginHarnessSessionDiagnostic,
  resolvePluginTask,
  resolvePluginTaskId,
  writePluginHarnessSession
} from "../src/integrations/opencode/plugin-runtime/harness/session.js";

test("plugin harness session persists the last prepared task", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-session-"));
  try {
    assert.equal(readPluginHarnessSession(root), undefined);
    writePluginHarnessSession(root, {
      taskId: "fix-login-timeout-bug",
      task: "fix login timeout bug",
      type: "bugfix",
      sessionId: "session-a",
      updatedAt: "2026-08-18T00:00:00.000Z"
    });
    assert.equal(existsSync(pluginHarnessSessionPath(root)), true);
    assert.equal(readPluginHarnessSession(root)?.taskId, "fix-login-timeout-bug");
    assert.equal(resolvePluginTaskId(root), "fix-login-timeout-bug");
    assert.equal(resolvePluginTaskId(root, "Another Task"), "another-task");
    assert.equal(readPluginHarnessSession(root)?.sessionId, "session-a");
    assert.equal(resolvePluginTask(root).source, "session");
    assert.equal(readPluginHarnessSessionDiagnostic(root).status, "ok");
    assert.equal(readPluginHarnessSession(root)?.schemaVersion, 1);
    assert.equal(readPluginHarnessSession(root)?.revision, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin session corruption is diagnostic instead of missing state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-session-corrupt-"));
  try {
    mkdirSync(path.dirname(pluginHarnessSessionPath(root)), { recursive: true });
    writeFileSync(pluginHarnessSessionPath(root), "{broken", "utf8");
    assert.equal(readPluginHarnessSessionDiagnostic(root).status, "corrupt");
    assert.throws(() => readPluginHarnessSession(root), /session JSON is corrupt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
