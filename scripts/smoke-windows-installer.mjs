import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

if (process.platform !== "win32") throw new Error("The Windows installer smoke test must run on Windows.");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.join(root, "release", "opencode-plusplus-setup-win-x64.exe");
const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const configDir = mkdtempSync(path.join(tmpdir(), "OpenCodePP 安装器-"));

try {
  assert.equal(existsSync(executable), true, "Build the Windows installer before running its smoke test.");
  assert.ok(statSync(executable).size < 12 * 1024 * 1024);
  await runConfigSmoke();
  await runHostPatchSmoke();
  verifyRealBundle();
  console.log(`Windows installer smoke test passed (${statSync(executable).size} bytes).`);
} finally {
  rmSync(configDir, { recursive: true, force: true });
}

async function runConfigSmoke() {
  const commands = ["on", "off", "status"].map((name) => path.join(configDir, "commands", `opencode-plusplus-${name}.md`));
  mkdirSync(path.dirname(commands[0]), { recursive: true });
  for (const file of commands) writeFileSync(file, "legacy prompt command", "utf8");
  const installed = runInstaller(["--config-dir", configDir, "--skip-host-patch", "--json"]);
  assert.equal(installed.action, "installed");
  assert.equal(installed.version, packageVersion);
  assert.equal(installed.commandsInstalled, 3);
  assert.equal(installed.agentFilesInstalled, 3);
  assert.equal(commands.every(existsSync), true);
  const agentFiles = ["plusplus-task.md", "plusplus-verify.md"].map((name) => path.join(configDir, "commands", name));
  const skill = path.join(configDir, "skills", "opencode-plusplus", "SKILL.md");
  for (const file of [...agentFiles, skill]) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /opencode-plusplus oc/);
    assert.doesNotMatch(content, /opencode-plusplus (build|verify|policy|orchestrate|doctor|report|trace|context)\b/);
  }
  assert.match(readFileSync(agentFiles[0], "utf8"), /Task: \$ARGUMENTS/);
  assert.match(readFileSync(skill, "utf8"), /name: opencode-plusplus/);
  const pluginFile = path.join(configDir, "plugins", "opencode-plusplus.js");
  const pluginModule = await awaitImport(pluginFile);
  assert.equal([...new Set(Object.values(pluginModule))].length, 1);
  assert.equal(typeof [...new Set(Object.values(pluginModule))][0], "function");
  assert.equal(runInstaller(["--config-dir", configDir, "--skip-host-patch", "--disable", "--json"]).enabled, false);
  assert.equal(runInstaller(["--config-dir", configDir, "--skip-host-patch", "--enable", "--json"]).enabled, true);
  runInstaller(["--config-dir", configDir, "--skip-host-patch", "--uninstall", "--json"]);
  assert.equal(existsSync(pluginFile), false);
}

async function runHostPatchSmoke() {
  const previousIgnore = process.env.OPENCODE_PLUSPLUS_TEST_IGNORE_RUNNING;
  process.env.OPENCODE_PLUSPLUS_TEST_IGNORE_RUNNING = "1";
  const hostRoot = mkdtempSync(path.join(tmpdir(), "OpenCodePP 宿主补丁 空格中文-é-"));
  const hostConfig = mkdtempSync(path.join(tmpdir(), "OpenCodePP host config-"));
  const asar = path.join(hostRoot, "resources dir", "app.asar");
  mkdirSync(path.dirname(asar), { recursive: true });
  const original = buildFakeAsar("0.0.0-fake", true).buffer;
  writeFileSync(asar, original);
  const originalHash = hash(original);
  const install = ["--config-dir", hostConfig, "--host-asar", asar, "--json"];
  try {
    const first = runInstaller(install);
    assert.equal(first.nativeCommandPatchStatus, "active");
    const patched = readFileSync(asar);
    assert.notEqual(hash(patched), originalHash);
    assert.equal(hash(readFileSync(`${asar}.opencode-plusplus.original`)), originalHash);
    const backup = JSON.parse(readFileSync(`${asar}.opencode-plusplus.json`, "utf8"));
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.marker, "OPENCODE_PLUSPLUS_NATIVE_COMMANDS");
    assert.equal(backup.desktopVersion, "0.0.0-fake");
    const main = readAsarFile(patched, "out/main/main.js");
    assert.match(main, /return \{ command: input\.command, original: true \};/);
    assert.deepEqual(nativeNames(main).sort(), ["opencode-plusplus-off", "opencode-plusplus-on", "opencode-plusplus-status"]);
    assert.match(main, /synthetic: true/);
    assert.doesNotMatch(main, /child_process|spawn\(|exec\(|fetch\(|\.completion|\.stream\(/);
    const patchedHash = hash(patched);
    assert.equal(runInstaller(install).nativeCommandPatchStatus, "active");
    assert.equal(hash(readFileSync(asar)), patchedHash);
    writeFileSync(asar, original);
    assert.equal(runInstaller(["--config-dir", hostConfig, "--host-asar", asar, "--status", "--json"]).nativeCommandPatchStatus, "stale");
    runInstallerFails(install, { OPENCODE_PLUSPLUS_TEST_FAIL_AT: "replace" }, /Test failure injected/);
    assert.equal(hash(readFileSync(asar)), originalHash);
    runInstallerFails(install, { OPENCODE_PLUSPLUS_TEST_FAIL_AT: "asar-write" }, /Test failure injected/);
    const unsupported = path.join(hostRoot, "unsupported.app.asar");
    writeFileSync(unsupported, buildFakeAsar("0.0.0-no-command", false).buffer);
    const emptyConfig = mkdtempSync(path.join(tmpdir(), "OpenCodePP unsupported-"));
    runInstallerFails(["--config-dir", emptyConfig, "--host-asar", unsupported, "--json"], {}, /bundle marker was not found/);
    assert.equal(existsSync(path.join(emptyConfig, "plugins", "opencode-plusplus.js")), false);
    rmSync(emptyConfig, { recursive: true, force: true });
    const fakeDir = mkdtempSync(path.join(tmpdir(), "OpenCodePP process-"));
    const fake = path.join(fakeDir, "OpenCode.exe");
    copyFileSync(path.join(process.env.WINDIR || "C:\\Windows", "System32", "ping.exe"), fake);
    const running = spawn(fake, ["-n", "30", "127.0.0.1"], { stdio: "ignore", windowsHide: true });
    try {
      await delay(500);
      runInstallerFails(install, { OPENCODE_PLUSPLUS_TEST_FORCE_RUNNING: "1" }, /Close OpenCode Desktop completely/);
    } finally {
      if (running.pid) spawnSync("taskkill.exe", ["/F", "/PID", String(running.pid)], { stdio: "ignore", windowsHide: true });
    }
    runInstaller(install);
    assert.notEqual(hash(readFileSync(asar)), originalHash);
    runInstaller(["--config-dir", hostConfig, "--host-asar", asar, "--uninstall", "--json"]);
    assert.equal(hash(readFileSync(asar)), originalHash);
    assert.equal(existsSync(`${asar}.opencode-plusplus.original`), false);
  } finally {
    rmSync(hostRoot, { recursive: true, force: true });
    rmSync(hostConfig, { recursive: true, force: true });
    if (previousIgnore === undefined) delete process.env.OPENCODE_PLUSPLUS_TEST_IGNORE_RUNNING;
    else process.env.OPENCODE_PLUSPLUS_TEST_IGNORE_RUNNING = previousIgnore;
  }
}

function buildFakeAsar(version, includeCommand) {
  const main = includeCommand
    ? 'const command = exports_Effect.fn("SessionPrompt.command")(function* (input) {\n  return { command: input.command, original: true };\n}\n'
    : "const unsupported = true;\n";
  const files = [
    { name: "package.json", content: Buffer.from(JSON.stringify({ name: "@opencode-aidesktop", version })) },
    { name: "out/main/main.js", content: Buffer.from(main) }
  ];
  const root = { files: {} };
  let offset = 0;
  for (const file of files) {
    const parts = file.name.split("/");
    const name = parts.pop();
    let node = root;
    for (const part of parts) node = node.files[part] ??= { files: {} };
    node.files[name] = { offset: String(offset), size: file.content.length };
    offset += file.content.length;
  }
  const json = Buffer.from(JSON.stringify(root));
  const payload = (4 + json.length + 3) & ~3;
  const header = Buffer.alloc(4 + payload);
  header.writeUInt32LE(payload, 0);
  header.writeUInt32LE(json.length, 4);
  json.copy(header, 8);
  const data = Buffer.concat(files.map((file) => file.content));
  const output = Buffer.alloc(8 + header.length + data.length);
  output.writeUInt32LE(4, 0);
  output.writeUInt32LE(header.length, 4);
  header.copy(output, 8);
  data.copy(output, 8 + header.length);
  return { buffer: output };
}

function readAsarFile(buffer, wanted) {
  return (
    readAsarFiles(buffer)
      .find((file) => file.name === wanted)
      ?.content.toString("utf8") ?? ""
  );
}

function readAsarFiles(buffer) {
  assert.equal(buffer.readUInt32LE(0), 4);
  const headerSize = buffer.readUInt32LE(4);
  const header = buffer.subarray(8, 8 + headerSize);
  const jsonSize = header.readUInt32LE(4);
  const tree = JSON.parse(header.subarray(8, 8 + jsonSize).toString("utf8"));
  const start = 8 + headerSize;
  const files = [];
  function walk(node, prefix = "") {
    for (const [name, entry] of Object.entries(node.files || {})) {
      const current = prefix ? `${prefix}/${name}` : name;
      if (entry.files) walk(entry, current);
      else files.push({ name: current, content: buffer.subarray(start + Number(entry.offset), start + Number(entry.offset) + Number(entry.size)) });
    }
  }
  walk(tree);
  return files;
}

function nativeNames(text) {
  const literal = text.match(/const OPENCODE_PLUSPLUS_NATIVE_COMMANDS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";
  return [...literal.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runInstaller(args, env = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true, env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`Installer failed (${result.status}): ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function runInstallerFails(args, env = {}, expected) {
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true, env: { ...process.env, ...env } });
  assert.notEqual(result.status, 0);
  if (expected) assert.match(`${result.stderr || ""}\n${result.stdout || ""}`, expected);
}

function verifyRealBundle() {
  const local = process.env.LOCALAPPDATA;
  const candidates = local
    ? [path.join(local, "Programs", "@opencode-aidesktop", "resources", "app.asar"), path.join(local, "Programs", "OpenCode", "resources", "app.asar")]
    : [];
  const asar = candidates.find(existsSync);
  if (!asar) return;
  const files = readAsarFiles(readFileSync(asar));
  const markers = files.reduce((sum, file) => sum + (file.content.toString("utf8").split("OPENCODE_PLUSPLUS_NATIVE_COMMANDS").length - 1), 0);
  if (markers > 0) assert.equal(existsSync(`${asar}.opencode-plusplus.original`), true);
  console.log(`Real OpenCode Desktop bundle verified read-only (${files.length} entries, patched=${markers > 0}).`);
}

function awaitImport(file) {
  return import(`${pathToFileURL(file).href}?smoke=${Date.now()}`);
}

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
