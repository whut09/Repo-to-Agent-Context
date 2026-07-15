import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCommandLine, runSafeCommand, runSafeCommandStreaming, shellQuote } from "../src/core/safe-command.js";

test("safe command parser preserves spaces and non-ASCII paths", () => {
  const parsed = parseCommandLine(`node "目录 带 空格/script.js" --repo '项目 路径/服务 A'`);

  assert.equal(parsed.file, "node");
  assert.deepEqual(parsed.args, ["目录 带 空格/script.js", "--repo", "项目 路径/服务 A"]);
});

test("safe command parser rejects shell control syntax", () => {
  assert.throws(() => parseCommandLine(`npm test && touch pwned.txt`), /Unsupported shell control operator/);
  assert.throws(() => parseCommandLine("npm test `touch pwned.txt`"), /Unsupported shell control operator/);
});

test("safe command parser preserves Windows backslash paths", () => {
  const parsed = parseCommandLine(`node 'C:\\Users\\dev\\AppData\\Local\\Temp\\script.cjs' --repo 'F:\\work repo\\app'`);

  assert.deepEqual(parsed.args, ["C:\\Users\\dev\\AppData\\Local\\Temp\\script.cjs", "--repo", "F:\\work repo\\app"]);
});

test("safe command runner falls back to cmd shims on Windows", { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus npm cmd 空格 "));
  const bin = path.join(root, "bin with spaces");
  const previousPath = process.env.PATH;
  try {
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, "fallback-tool.cmd"), "@echo off\r\necho fallback:%~1\r\n", "utf8");
    process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ""}`;
    const result = runSafeCommand('fallback-tool "hello world"', { cwd: root });
    assert.equal(result.file, "fallback-tool.cmd");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /fallback:hello world/);
  } finally {
    process.env.PATH = previousPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("shellQuote single-quotes substituted placeholder data", () => {
  assert.equal(shellQuote("can't $(touch pwned)"), "'can'\\''t $(touch pwned)'");
});

test("streaming command stops after idle timeout", async () => {
  const result = await runSafeCommandStreaming(`node -e "setInterval(function(){}, 60000)"`, {
    cwd: process.cwd(),
    idleTimeoutMs: 100,
    timeoutMs: 5000
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /no output/i);
});
