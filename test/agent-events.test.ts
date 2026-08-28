import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeAgentEvents, normalizeOpenCodeJsonStream, normalizeOpenCodeTranscript } from "../src/outputs/agent-events.js";

test("OpenCode JSON stdout normalizer extracts messages, file events, commands, and tests", () => {
  const stdout = [
    JSON.stringify({ type: "message.part.updated", part: { type: "text", text: "I will inspect auth." }, timestamp: "2026-06-15T00:00:00.000Z" }),
    JSON.stringify({ type: "message.part.updated", part: { type: "tool", name: "Read", args: { path: "src/auth/session.ts" } } }),
    JSON.stringify({ type: "tool.call", name: "Edit", args: { file: "src/auth/session.ts" } }),
    JSON.stringify({ type: "tool.call", name: "Bash", args: { command: "npm run test -- auth" }, exitCode: 0 })
  ].join("\n");

  const result = normalizeOpenCodeJsonStream(stdout);

  assert.equal(result.source, "opencode-json");
  assert.ok(result.events.some((event) => event.type === "message" && event.text.includes("inspect auth")));
  assert.ok(result.events.some((event) => event.type === "file_read" && event.path === "src/auth/session.ts"));
  assert.ok(result.events.some((event) => event.type === "file_edit" && event.path === "src/auth/session.ts"));
  assert.ok(result.events.some((event) => event.type === "test_run" && event.command.includes("npm run test") && event.exitCode === 0));
});

test("OpenCode test selector is a command event, not a test result", () => {
  const result = normalizeOpenCodeJsonStream(
    JSON.stringify({
      type: "tool.call",
      name: "Bash",
      args: { command: "opencode-plusplus tests . --diff --base main" },
      exitCode: 0
    })
  );

  assert.ok(result.events.some((event) => event.type === "command_run"));
  assert.equal(
    result.events.some((event) => event.type === "test_run"),
    false
  );
});

test("OpenCode transcript normalizer reads JSON transcript files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-opencode-transcript-"));
  try {
    const transcript = path.join(root, "session.jsonl");
    writeFileSync(
      transcript,
      `${JSON.stringify({ type: "tool.call", name: "Write", args: { path: "src/index.ts" }, timestamp: "2026-06-15T00:00:01.000Z" })}\n`,
      "utf8"
    );

    const result = normalizeOpenCodeTranscript(root, "session.jsonl");

    assert.equal(result.source, "opencode-transcript");
    assert.deepEqual(result.events[0], { type: "file_edit", path: "src/index.ts", ts: "2026-06-15T00:00:01.000Z" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generic executor output falls back to assistant message or error event", () => {
  const ok = normalizeAgentEvents({
    executor: "codex",
    stdout: "done",
    stderr: "",
    repo: ".",
    exitCode: 0,
    finishedAt: "2026-06-15T00:00:00.000Z"
  });
  const failed = normalizeAgentEvents({
    executor: "cursor",
    stdout: "",
    stderr: "failed",
    repo: ".",
    exitCode: 1,
    finishedAt: "2026-06-15T00:00:00.000Z"
  });

  assert.equal(ok.source, "generic-output");
  assert.equal(ok.events[0]?.type, "message");
  assert.equal(failed.events[0]?.type, "error");
});
