import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as fs from "node:fs";
import * as os from "node:os";
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

test("Windows installer writes the global plugin and native command files", () => {
  const configDir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-installer-test-"));
  try {
    const legacyCommands = ["on", "off", "status"].map((name) => path.join(configDir, "commands", `opencode-plusplus-${name}.md`));
    mkdirSync(path.dirname(legacyCommands[0]!), { recursive: true });
    for (const commandFile of legacyCommands) writeFileSync(commandFile, "legacy prompt command", "utf8");

    const installed = installWindowsOpenCodePlugin(payload, configDir);
    assert.equal(installed.ok, true);
    assert.equal(installed.commandsInstalled, 3);
    assert.equal(installed.agentFilesInstalled, 3);
    assert.equal(
      legacyCommands.every((commandFile) => existsSync(commandFile)),
      true
    );
    for (const commandFile of legacyCommands) assert.match(readFileSync(commandFile, "utf8"), /local, no model/);
    assert.equal(existsSync(installed.paths.pluginFile), true);
    assert.equal(JSON.parse(readFileSync(installed.paths.stateFile, "utf8")).enabled, true);

    const plusPlusTaskFile = path.join(configDir, "commands", "plusplus-task.md");
    const plusPlusVerifyFile = path.join(configDir, "commands", "plusplus-verify.md");
    const skillFile = path.join(configDir, "skills", "opencode-plusplus", "SKILL.md");
    assert.deepEqual(installed.paths.agentCommandFiles, [plusPlusTaskFile, plusPlusVerifyFile]);
    assert.equal(installed.paths.skillFile, skillFile);
    for (const file of [plusPlusTaskFile, plusPlusVerifyFile, skillFile]) {
      assert.equal(existsSync(file), true, `installer must write ${path.basename(file)}`);
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /opencode-plusplus oc\b/, "agent file must not reference the opencode-plusplus oc CLI command");
      assert.doesNotMatch(content, /opencode-plusplus (build|verify|policy|orchestrate|doctor|report|trace|context)\b/, "agent file must not reference the opencode-plusplus CLI");
    }
    assert.match(readFileSync(plusPlusTaskFile, "utf8"), /Task: \$ARGUMENTS/);
    assert.match(readFileSync(plusPlusTaskFile, "utf8"), /opencode_plusplus_prepare/);
    assert.match(readFileSync(plusPlusVerifyFile, "utf8"), /opencode_plusplus_evaluate/);
    assert.match(readFileSync(skillFile, "utf8"), /^name: opencode-plusplus/m);
    const manifest = JSON.parse(readFileSync(installed.paths.manifestFile, "utf8"));
    assert.deepEqual(manifest.agentCommands, ["plusplus-task.md", "plusplus-verify.md"]);
    assert.equal(manifest.skill, "skills/opencode-plusplus/SKILL.md");

    setWindowsOpenCodePluginEnabled(false, configDir);
    assert.equal(getWindowsOpenCodePluginStatus(configDir).enabled, false);
    const upgraded = installWindowsOpenCodePlugin(payload, configDir);
    assert.equal(upgraded.enabled, false);
    assert.equal(JSON.parse(readFileSync(upgraded.paths.stateFile, "utf8")).version, getOpenCodePlusplusPackageVersion());

    const removed = uninstallWindowsOpenCodePlugin(configDir);
    assert.equal(removed.pluginExists, false);
    assert.equal(existsSync(removed.paths.pluginFile), false);
    assert.equal(existsSync(removed.paths.stateFile), false);
    assert.equal(removed.agentFilesInstalled, 0);
    assert.equal(existsSync(plusPlusTaskFile), false, "uninstall must remove plusplus-task.md");
    assert.equal(existsSync(plusPlusVerifyFile), false, "uninstall must remove plusplus-verify.md");
    assert.equal(existsSync(skillFile), false, "uninstall must remove SKILL.md");
    assert.equal(existsSync(path.join(configDir, "skills", "opencode-plusplus")), false, "uninstall must remove the empty skill directory");
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test("native Desktop commands read and update local state without an executor", () => {
  const configDir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-native-command-test-"));
  try {
    const source = readFileSync(path.resolve("src/installer/native-command-patch.js"), "utf8");
    const context: Record<string, unknown> = {
      NFS__default: fs,
      path79__default: path,
      os23__default: os,
      process: { env: { OPENCODE_CONFIG_DIR: configDir }, pid: 42 }
    };
    runInNewContext(`${source}\nthis.nativeControl = opencodePlusPlusNativeControl;`, context);
    const nativeControl = context.nativeControl as (command: string) => string;

    assert.match(nativeControl("opencode-plusplus-status"), /Installed: no/);
    assert.match(nativeControl("opencode-plusplus-off"), /Enabled: no/);
    assert.equal(JSON.parse(readFileSync(path.join(configDir, "opencode-plusplus", "state.json"), "utf8")).enabled, false);
    assert.match(nativeControl("opencode-plusplus-on"), /Enabled: yes/);
    assert.equal(JSON.parse(readFileSync(path.join(configDir, "opencode-plusplus", "state.json"), "utf8")).enabled, true);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});
