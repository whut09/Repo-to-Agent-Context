import assert from "node:assert/strict";
import test from "node:test";
import { parseEvaluateArgs, parseFeedbackArgs, parseNextArgs, parsePrepareArgs, parseRetrieveArgs } from "../src/integrations/opencode/plugin-runtime/harness/args.js";

test("plugin harness arg parsers reject empty tasks and accept optional fields", () => {
  assert.equal(parsePrepareArgs({}), "prepare requires a non-empty task.");
  assert.deepEqual(parsePrepareArgs({ task: "fix login timeout", type: "bugfix" }), { task: "fix login timeout", type: "bugfix" });
  assert.match(String(parsePrepareArgs({ task: "x", type: "docs" })), /bugfix/);
  assert.deepEqual(parseRetrieveArgs({ task: "auth", topK: "5" }), { task: "auth", topK: 5 });
  assert.deepEqual(parseRetrieveArgs({ task: "auth", taskType: "refactor" }), { task: "auth", taskType: "refactor" });
  assert.deepEqual(parseRetrieveArgs({ task: "auth", contextId: "private/auth", file: "docs/auth/errors.md" }), {
    task: "auth",
    contextId: "private/auth",
    file: "docs/auth/errors.md"
  });
  assert.deepEqual(parseRetrieveArgs({ task: "auth", contextId: "private/auth", full: true }), { task: "auth", contextId: "private/auth", full: true });
  assert.equal(parseRetrieveArgs({ task: "auth", file: "docs/auth/errors.md" }), "retrieve file requires contextId.");
  assert.equal(parseRetrieveArgs({ task: "auth", contextId: "private/auth", file: "x.md", full: true }), "retrieve file cannot be combined with full.");
  assert.match(String(parseRetrieveArgs({ task: "auth", taskType: "docs" })), /taskType/);
  assert.equal(parseRetrieveArgs({ task: "auth", topK: 0 }), "retrieve topK must be a positive integer.");
  assert.deepEqual(parseEvaluateArgs({}), {});
  assert.equal(parseEvaluateArgs({ taskId: "   " }), "evaluate taskId must be a non-empty string when provided.");
  assert.deepEqual(parseNextArgs({ taskId: "fix-login-timeout" }), { taskId: "fix-login-timeout" });
  assert.deepEqual(parseFeedbackArgs({ entryId: "official/auth", source: "official", revision: 2, target: "entry", label: "useful" }), {
    entryId: "official/auth",
    source: "official",
    revision: 2,
    target: "entry",
    label: "useful"
  });
  assert.equal(parseFeedbackArgs({ entryId: "official/auth", source: "official", revision: 2, target: "file", label: "useful" }), "file feedback requires file.");
});
