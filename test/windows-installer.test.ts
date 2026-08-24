import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getOpenCodePlusplusPackageVersion } from "../src/core/package-info.js";
import {
  getWindowsOpenCodePluginStatus,
  installWindowsOpenCodePlugin,
  setWindowsOpenCodePluginEnabled,
  uninstallWindowsOpenCodePlugin
} from "../src/installer/windows-installer.js";

const payload = {
  pluginGzipBase64: gzipSync(Buffer.from("export async function OpenCodePlusPlusGlobalPlugin() {}\n", "utf8")).toString("base64")
};

test("Windows installer writes the plugin and OpenCode++ primary mode", () => {
  const configDir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-installer-test-"));
  try {
    const legacyFiles = ["opencode-plusplus-on.md", "opencode-plusplus-off.md", "opencode-plusplus-status.md", "plusplus-task.md", "plusplus-verify.md"].map(
      (name) => path.join(configDir, "commands", name)
    );
    const legacySkill = path.join(configDir, "skills", "opencode-plusplus", "SKILL.md");
    mkdirSync(path.dirname(legacyFiles[0]!), { recursive: true });
    for (const file of [...legacyFiles, legacySkill]) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "legacy", "utf8");
    }

    const installed = installWindowsOpenCodePlugin(payload, configDir);
    assert.equal(installed.ok, true);
    assert.equal(installed.commandsInstalled, 0);
    assert.equal(installed.modeInstalled, true);
    assert.equal(installed.agentFilesInstalled, 1);
    assert.equal(legacyFiles.some(existsSync), false);
    assert.equal(existsSync(legacySkill), false);
    assert.equal(existsSync(installed.paths.agentFile), true);
    assert.match(readFileSync(installed.paths.agentFile, "utf8"), /mode: primary/);
    assert.match(readFileSync(installed.paths.agentFile, "utf8"), /opencode_plusplus_prepare/);
    assert.equal(JSON.parse(readFileSync(installed.paths.stateFile, "utf8")).enabled, true);

    const manifest = JSON.parse(readFileSync(installed.paths.manifestFile, "utf8"));
    assert.equal(manifest.mode, "opencode-plusplus");
    assert.equal(manifest.agent, "agents/opencode-plusplus.md");
    assert.deepEqual(manifest.commands, []);

    setWindowsOpenCodePluginEnabled(false, configDir);
    assert.equal(getWindowsOpenCodePluginStatus(configDir).enabled, false);
    const upgraded = installWindowsOpenCodePlugin(payload, configDir);
    assert.equal(upgraded.enabled, false);
    assert.equal(JSON.parse(readFileSync(upgraded.paths.stateFile, "utf8")).version, getOpenCodePlusplusPackageVersion());

    const removed = uninstallWindowsOpenCodePlugin(configDir);
    assert.equal(removed.pluginExists, false);
    assert.equal(existsSync(removed.paths.pluginFile), false);
    assert.equal(existsSync(removed.paths.stateFile), false);
    assert.equal(removed.modeInstalled, false);
    assert.equal(existsSync(removed.paths.agentFile), false);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test("installer prompt defines a primary OpenCode mode and no Slash Commands", () => {
  const prompt = readFileSync(path.resolve("src/installer/opencode-plusplus-prompts.ts"), "utf8");
  assert.match(prompt, /PLUSPLUS_AGENT_FILE = "agents\/opencode-plusplus\.md"/);
  assert.match(prompt, /mode: primary/);
  assert.doesNotMatch(prompt, /PLUSPLUS_TASK_COMMAND|PLUSPLUS_VERIFY_COMMAND|PLUSPLUS_SKILL/);
});

test("real Desktop launch smoke is explicit and cleans up its process", () => {
  const smoke = readFileSync(path.resolve("scripts/smoke-windows-installer.mjs"), "utf8");
  assert.match(smoke, /process\.argv\.includes\("--require-real-desktop-launch"\)/);
  assert.match(smoke, /OPENCODE_DESKTOP_EXE/);
  assert.match(smoke, /isOpenCodeRunning\(\)/);
  assert.match(smoke, /taskkill\.exe/);
});
