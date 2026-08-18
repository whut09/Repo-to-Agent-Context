import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("Windows installer writes the global plugin and removes legacy prompt commands", () => {
  const configDir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-installer-test-"));
  try {
    const legacyCommands = ["on", "off", "status"].map((name) => path.join(configDir, "commands", `opencode-plusplus-${name}.md`));
    mkdirSync(path.dirname(legacyCommands[0]!), { recursive: true });
    for (const commandFile of legacyCommands) writeFileSync(commandFile, "legacy prompt command", "utf8");

    const installed = installWindowsOpenCodePlugin(payload, configDir);
    assert.equal(installed.ok, true);
    assert.equal(installed.commandsInstalled, 0);
    assert.equal(
      legacyCommands.every((commandFile) => !existsSync(commandFile)),
      true
    );
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
