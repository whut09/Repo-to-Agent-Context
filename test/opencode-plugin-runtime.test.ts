import assert from "node:assert/strict";
import test from "node:test";
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
