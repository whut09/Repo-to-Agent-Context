import assert from "node:assert/strict";
import test from "node:test";
import { completionRuleFor, isFinalizeAction } from "../src/integrations/opencode/plugin-runtime/harness/completion.js";
import { renderEvaluateText, renderHarnessError, renderNextText, renderPrepareText, renderRetrieveText } from "../src/integrations/opencode/plugin-runtime/harness/format.js";
import type { PluginHarnessResult } from "../src/integrations/opencode/plugin-runtime/harness/types.js";

const base: PluginHarnessResult = {
  schemaVersion: "opencode-plusplus.desktop-harness.v1",
  ok: true,
  tool: "evaluate",
  summary: "stable result",
  taskId: "fix-login-timeout",
  sessionId: "session-1",
  taskIdSource: "argument",
  repository: "C:/repo",
  workingTreeHash: "hash",
  currentPhase: "evaluate",
  decision: "run-tests",
  blocking: true,
  findings: ["missing tests"],
  missingEvidence: ["command evidence"],
  requiredCommands: ["npm run test"],
  mustInspect: ["src/auth/session.ts"],
  allowedEditGlobs: ["src/auth/session.ts"],
  avoidEditGlobs: ["dist/**"],
  artifacts: [".agent-context/runs/fix-login-timeout/run.json"],
  nextAction: "run-tests"
};

test("plugin harness renderers expose the unified Desktop protocol fields", () => {
  for (const rendered of [renderPrepareText(base), renderRetrieveText({ ...base, tool: "retrieve", hits: [{ path: "src/auth/session.ts", score: 12, reason: "timeout" }] }), renderEvaluateText(base), renderNextText(base)]) {
    const parsed = JSON.parse(rendered) as PluginHarnessResult;
    assert.equal(parsed.schemaVersion, "opencode-plusplus.desktop-harness.v1");
    assert.equal(parsed.taskId, "fix-login-timeout");
    assert.equal(parsed.sessionId, "session-1");
    assert.equal(parsed.repository, "C:/repo");
    assert.ok(Array.isArray(parsed.findings));
    assert.ok(typeof parsed.summary === "string");
  }
  assert.match(renderRetrieveText({ ...base, tool: "retrieve", hits: [{ path: "src/auth/session.ts", score: 12, reason: "timeout" }] }), /src\/auth\/session\.ts/);
});

test("structured harness errors never become unparseable text", () => {
  const parsed = JSON.parse(renderHarnessError("evaluate", "missing task")) as PluginHarnessResult;
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error?.code, "HARNESS_ERROR");
  assert.equal(parsed.blocking, true);
  assert.equal(parsed.nextAction, "prepare");
});

test("next completion rule forbids claiming done unless finalize is unblocked", () => {
  assert.equal(isFinalizeAction("ready-for-review", false), true);
  assert.equal(isFinalizeAction("run-tests", false), false);
  assert.match(completionRuleFor("run-tests", true), /不得声称任务完成/);
  assert.match(completionRuleFor("ready-for-review", false), /ready for review/);
});
