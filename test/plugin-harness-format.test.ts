import assert from "node:assert/strict";
import test from "node:test";
import { completionRuleFor, isFinalizeAction } from "../src/integrations/opencode/plugin-runtime/harness/completion.js";
import {
  renderEvaluateText,
  renderHarnessError,
  renderNextText,
  renderPrepareText,
  renderRetrieveText
} from "../src/integrations/opencode/plugin-runtime/harness/format.js";

test("plugin harness text renderers include the Desktop contract fields", () => {
  assert.match(
    renderPrepareText({
      taskId: "fix-login-timeout",
      task: "fix login timeout",
      type: "bugfix",
      mustInspect: ["src/auth/session.ts"],
      allowedEditGlobs: ["src/auth/session.ts"],
      avoidEditGlobs: ["dist/**"],
      requiredCommands: ["npm run test"],
      nextStep: "Read mustInspect source files"
    }),
    /taskId: fix-login-timeout[\s\S]*mustInspect:[\s\S]*allowedEditGlobs:[\s\S]*avoidEditGlobs:[\s\S]*requiredCommands:[\s\S]*next:/
  );
  assert.match(
    renderRetrieveText({ task: "auth", hits: [{ path: "src/auth/session.ts", score: 12, reason: "timeout" }] }),
    /src\/auth\/session\.ts \(score 12\)/
  );
  assert.match(
    renderEvaluateText({
      taskId: "fix-login-timeout",
      blocking: true,
      decision: "run-tests",
      findings: ["missing tests"],
      missingEvidence: ["command evidence"],
      requiredCommands: ["npm run test"]
    }),
    /blocking: yes[\s\S]*decision: run-tests[\s\S]*missingEvidence:/
  );
  assert.match(
    renderNextText({
      taskId: "fix-login-timeout",
      nextAction: "run-tests",
      blocking: true,
      missingEvidence: ["tests"],
      requiredCommands: ["npm run test"],
      completionRule: "不得声称任务完成。"
    }),
    /nextAction: run-tests[\s\S]*不得声称任务完成/
  );
  assert.match(renderHarnessError("evaluate", "missing task"), /evaluate failed[\s\S]*Do not claim the task is complete/);
});

test("next completion rule forbids claiming done unless finalize is unblocked", () => {
  assert.equal(isFinalizeAction("ready-for-review", false), true);
  assert.equal(isFinalizeAction("run-tests", false), false);
  assert.match(completionRuleFor("run-tests", true), /不得声称任务完成/);
  assert.match(completionRuleFor("ready-for-review", false), /ready for review/);
});
