import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getWindowsOpenCodePluginStatus,
  installWindowsOpenCodePlugin,
  setWindowsOpenCodePluginEnabled,
  uninstallWindowsOpenCodePlugin
} from "../src/installer/windows-installer.js";

const payload = {
  pluginGzipBase64: gzipSync(Buffer.from("export async function OpenCodePlusPlusGlobalPlugin() {}\n", "utf8")).toString("base64")
};

test("Windows installer writes global plugin, controls, and state atomically", () => {
  const configDir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-installer-test-"));
  try {
    const installed = installWindowsOpenCodePlugin(payload, configDir);
    assert.equal(installed.ok, true);
    assert.equal(installed.commandsInstalled, 3);
    assert.equal(existsSync(installed.paths.pluginFile), true);
    assert.equal(JSON.parse(readFileSync(installed.paths.stateFile, "utf8")).enabled, true);

    setWindowsOpenCodePluginEnabled(false, configDir);
    assert.equal(getWindowsOpenCodePluginStatus(configDir).enabled, false);
    const upgraded = installWindowsOpenCodePlugin(payload, configDir);
    assert.equal(upgraded.enabled, false);

    const removed = uninstallWindowsOpenCodePlugin(configDir);
    assert.equal(removed.pluginExists, false);
    assert.equal(existsSync(removed.paths.pluginFile), false);
    assert.equal(existsSync(removed.paths.stateFile), false);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});
