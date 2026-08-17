import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runGit } from "../src/core/git.js";
import { initOpenCodeDesktopProject } from "../src/integrations/opencode/desktop.js";
import { OPENCODE_SIDECAR_PLUGIN_PATH } from "../src/integrations/opencode/plugin-template.js";

test("OpenCode Desktop init writes context, project helpers, and the sidecar plugin", async () => {
  const root = createRepository();
  try {
    const report = await initOpenCodeDesktopProject(root);

    assert.equal(report.context.status, "generated");
    assert.ok(report.context.filesWritten > 0);
    assert.equal(existsSync(path.join(root, ".agent-context", "repo-summary.md")), true);
    assert.equal(existsSync(path.join(root, ".opencode", "commands", "opencode-plusplus.md")), true);
    assert.equal(existsSync(path.join(root, ".opencode", "agents", "opencode-plusplus.md")), true);
    assert.equal(existsSync(path.join(root, OPENCODE_SIDECAR_PLUGIN_PATH)), true);

    const second = await initOpenCodeDesktopProject(root);
    assert.equal(second.context.status, "ready");
    assert.ok(second.project.files.every((file) => file.status === "skipped"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenCode Desktop init can refresh a stale generated plugin", async () => {
  const root = createRepository();
  try {
    await initOpenCodeDesktopProject(root, { skipContext: true });
    const pluginPath = path.join(root, OPENCODE_SIDECAR_PLUGIN_PATH);
    writeFileSync(pluginPath, "stale plugin\n", "utf8");

    const report = await initOpenCodeDesktopProject(root, { skipContext: true, force: true });

    assert.equal(report.context.status, "skipped");
    assert.match(readFileSync(pluginPath, "utf8"), /OpenCodePlusPlusSidecar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenCode Desktop init rejects conflicting context options", async () => {
  const root = createRepository();
  try {
    await assert.rejects(
      initOpenCodeDesktopProject(root, { skipContext: true, refreshContext: true }),
      /--skip-context and --refresh-context cannot be used together/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRepository(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-desktop-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "desktop-fixture", scripts: { test: "node -e 1" } }), "utf8");
  writeFileSync(path.join(root, "index.ts"), "export const value = 1;\n", "utf8");
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(root, ["config", "user.name", "OpenCode Plus Plus"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  return root;
}
