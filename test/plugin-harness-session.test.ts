import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  pluginHarnessSessionPath,
  readPluginHarnessSession,
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
