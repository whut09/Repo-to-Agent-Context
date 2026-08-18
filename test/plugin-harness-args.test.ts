import assert from "node:assert/strict";
import test from "node:test";
import { parseEvaluateArgs, parseNextArgs, parsePrepareArgs, parseRetrieveArgs } from "../src/integrations/opencode/plugin-runtime/harness/args.js";

test("plugin harness arg parsers reject empty tasks and accept optional fields", () => {
  assert.equal(parsePrepareArgs({}), "prepare requires a non-empty task.");
  assert.deepEqual(parsePrepareArgs({ task: "fix login timeout", type: "bugfix" }), { task: "fix login timeout", type: "bugfix" });
  assert.match(String(parsePrepareArgs({ task: "x", type: "docs" })), /bugfix/);
  assert.deepEqual(parseRetrieveArgs({ task: "auth", topK: "5" }), { task: "auth", topK: 5 });
  assert.equal(parseRetrieveArgs({ task: "auth", topK: 0 }), "retrieve topK must be a positive integer.");
  assert.deepEqual(parseEvaluateArgs({}), {});
  assert.equal(parseEvaluateArgs({ taskId: "   " }), "evaluate taskId must be a non-empty string when provided.");
  assert.deepEqual(parseNextArgs({ taskId: "fix-login-timeout" }), { taskId: "fix-login-timeout" });
});
