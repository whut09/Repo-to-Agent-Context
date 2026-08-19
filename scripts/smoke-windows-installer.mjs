import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

if (process.platform !== "win32") throw new Error("The Windows installer smoke test must run on Windows.");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.join(root, "release", "opencode-plusplus-setup-win-x64.exe");
const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const configDir = mkdtempSync(path.join(tmpdir(), "OpenCodePP 安装器-"));
const temporaryRoot = path.resolve(tmpdir()) + path.sep;
const resolvedConfig = path.resolve(configDir);
if (!resolvedConfig.startsWith(temporaryRoot)) throw new Error(`Refusing to use unexpected temporary path: ${resolvedConfig}`);

try {
  assert.equal(existsSync(executable), true, "Build the Windows installer before running its smoke test.");
  assert.ok(statSync(executable).size < 12 * 1024 * 1024, `Installer is unexpectedly large: ${statSync(executable).size} bytes`);

  const legacyCommands = ["on", "off", "status"].map((name) => path.join(configDir, "commands", `opencode-plusplus-${name}.md`));
  mkdirSync(path.dirname(legacyCommands[0]), { recursive: true });
  for (const commandFile of legacyCommands) writeFileSync(commandFile, "legacy prompt command", "utf8");

  const installed = runInstaller(["--config-dir", configDir, "--skip-host-patch", "--json"]);
  assert.equal(installed.action, "installed");
  assert.equal(installed.version, packageVersion);
  assert.equal(installed.commandsInstalled, 3);
  assert.equal(installed.agentFilesInstalled, 3);
  assert.equal(
    legacyCommands.every((commandFile) => existsSync(commandFile)),
    true
  );

  const agentCommandFiles = ["plusplus-task.md", "plusplus-verify.md"].map((name) => path.join(configDir, "commands", name));
  const skillFile = path.join(configDir, "skills", "opencode-plusplus", "SKILL.md");
  for (const file of [...agentCommandFiles, skillFile]) {
    assert.equal(existsSync(file), true, `Installer must write ${file}`);
    const content = readFileSync(file, "utf8");
    assert.ok(!content.includes("opencode-plusplus oc"), `${file} must not reference the opencode-plusplus oc CLI command`);
    assert.ok(
      !/opencode-plusplus (build|verify|policy|orchestrate|doctor|report|trace|context)\b/.test(content),
      `${file} must not reference the opencode-plusplus CLI`
    );
  }
  assert.ok(readFileSync(agentCommandFiles[0], "utf8").includes("Task: $ARGUMENTS"), "plusplus-task must pass $ARGUMENTS as the task");
  assert.ok(readFileSync(skillFile, "utf8").includes("name: opencode-plusplus"), "SKILL.md must declare the opencode-plusplus skill");

  const pluginFile = path.join(configDir, "plugins", "opencode-plusplus.js");
  const pluginModule = await import(`${pathToFileURL(pluginFile).href}?smoke=${Date.now()}`);
  const pluginExports = [...new Set(Object.values(pluginModule))];
  assert.equal(pluginExports.length, 1);
  assert.equal(typeof pluginExports[0], "function");
  const hooks = await pluginExports[0]({ directory: root, worktree: root, project: {} });
  assert.deepEqual(Object.keys(hooks.tool).sort(), [
    "opencode_plusplus_disable",
    "opencode_plusplus_enable",
    "opencode_plusplus_evaluate",
    "opencode_plusplus_next",
    "opencode_plusplus_prepare",
    "opencode_plusplus_retrieve",
    "opencode_plusplus_status"
  ]);

  assert.equal(runInstaller(["--config-dir", configDir, "--skip-host-patch", "--disable", "--json"]).enabled, false);
  assert.equal(runInstaller(["--config-dir", configDir, "--skip-host-patch", "--json"]).enabled, false);
  assert.equal(JSON.parse(readFileSync(path.join(configDir, "opencode-plusplus", "state.json"), "utf8")).version, packageVersion);
  assert.equal(runInstaller(["--config-dir", configDir, "--skip-host-patch", "--enable", "--json"]).enabled, true);
  assert.equal(runInstaller(["--config-dir", configDir, "--skip-host-patch", "--uninstall", "--json"]).pluginExists, false);
  assert.equal(existsSync(pluginFile), false);
  assert.equal(existsSync(agentCommandFiles[0]), false, "Uninstall must remove plusplus-task.md");
  assert.equal(existsSync(agentCommandFiles[1]), false, "Uninstall must remove plusplus-verify.md");
  assert.equal(existsSync(skillFile), false, "Uninstall must remove SKILL.md");

  console.log(`Windows installer smoke test passed (${statSync(executable).size} bytes).`);
} finally {
  rmSync(resolvedConfig, { recursive: true, force: true });
}

function runInstaller(args) {
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Installer failed (${result.status}): ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}
