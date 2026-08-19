import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { readJsonDiagnostic, writeJsonAtomic, writeTextAtomic } from "../core/atomic-store.js";
import { getOpenCodePlusplusPackageVersion } from "../core/package-info.js";
import { agentCommandFiles, PLUSPLUS_SKILL, PLUSPLUS_SKILL_FILE } from "./opencode-plusplus-prompts.js";
import { readOpenCodePlusPlusPluginStatus, setOpenCodePlusPlusPluginEnabled } from "../integrations/opencode/plugin-runtime/state.js";

export const WINDOWS_INSTALLER_SCHEMA_VERSION = 1;
export const WINDOWS_PLUGIN_FILE = "opencode-plusplus.js";

export interface WindowsInstallerPayload {
  pluginGzipBase64: string;
}

export interface WindowsInstallPaths {
  configDir: string;
  pluginFile: string;
  stateFile: string;
  manifestFile: string;
  commandFiles: string[];
  agentCommandFiles: string[];
  skillFile: string;
}

export interface WindowsInstallReport {
  action: "installed" | "uninstalled" | "enabled" | "disabled" | "status";
  ok: boolean;
  version: string;
  paths: WindowsInstallPaths;
  pluginExists: boolean;
  enabled: boolean;
  commandsInstalled: number;
  agentFilesInstalled: number;
  message: string;
}

export function resolveWindowsInstallPaths(configDir = defaultOpenCodeConfigDir()): WindowsInstallPaths {
  const root = path.resolve(configDir);
  return {
    configDir: root,
    pluginFile: path.join(root, "plugins", WINDOWS_PLUGIN_FILE),
    stateFile: path.join(root, "opencode-plusplus", "state.json"),
    manifestFile: path.join(root, "opencode-plusplus", "installation.json"),
    commandFiles: ["on", "off", "status"].map((name) => path.join(root, "commands", `opencode-plusplus-${name}.md`)),
    agentCommandFiles: agentCommandFiles().map((entry) => path.join(root, "commands", entry.file)),
    skillFile: path.join(root, ...PLUSPLUS_SKILL_FILE.split("/"))
  };
}

export function installWindowsOpenCodePlugin(payload: WindowsInstallerPayload, configDir?: string): WindowsInstallReport {
  const paths = resolveWindowsInstallPaths(configDir);
  const plugin = gunzipSync(Buffer.from(payload.pluginGzipBase64, "base64")).toString("utf8");
  if (!plugin.includes("OpenCodePlusPlusGlobalPlugin")) throw new Error("Installer payload does not contain the OpenCode++ plugin entry.");

  mkdirSync(path.dirname(paths.pluginFile), { recursive: true });
  writeTextAtomic(paths.pluginFile, plugin);
  for (const [index, commandFile] of paths.commandFiles.entries()) writeTextAtomic(commandFile, nativeCommandFiles()[index] ?? nativeCommandFiles()[2]);
  for (const [index, agentCommandFile] of paths.agentCommandFiles.entries()) {
    const entry = agentCommandFiles()[index] ?? agentCommandFiles()[0];
    writeTextAtomic(agentCommandFile, entry?.content ?? "");
  }

  const existingState = readJsonDiagnostic<Record<string, unknown>>(paths.stateFile);
  if (existingState.status === "corrupt") throw new Error(`Cannot install over corrupt state file: ${existingState.error}`);
  const enabled = existingState.status === "ok" ? existingState.value.enabled !== false : true;
  setOpenCodePlusPlusPluginEnabled(enabled, paths.stateFile);
  writeTextAtomic(paths.skillFile, PLUSPLUS_SKILL);
  writeJsonAtomic(paths.manifestFile, {
    schemaVersion: WINDOWS_INSTALLER_SCHEMA_VERSION,
    revision: Date.now(),
    version: getOpenCodePlusplusPackageVersion(),
    installedAt: new Date().toISOString(),
    plugin: WINDOWS_PLUGIN_FILE,
    commands: paths.commandFiles.map((file) => path.basename(file)),
    agentCommands: paths.agentCommandFiles.map((file) => path.basename(file)),
    skill: PLUSPLUS_SKILL_FILE
  });
  return makeReport("installed", paths, "OpenCode++ was installed for the current Windows user.");
}

export function uninstallWindowsOpenCodePlugin(configDir?: string): WindowsInstallReport {
  const paths = resolveWindowsInstallPaths(configDir);
  for (const file of [paths.pluginFile, paths.manifestFile, paths.stateFile, ...paths.commandFiles, ...paths.agentCommandFiles, paths.skillFile]) {
    if (existsSync(file)) rmSync(file, { force: true });
  }
  removeEmptyDirectory(path.dirname(paths.manifestFile));
  removeEmptyDirectory(path.dirname(paths.skillFile));
  removeEmptyDirectory(path.dirname(path.dirname(paths.skillFile)));
  return makeReport("uninstalled", paths, "OpenCode++ was removed from the current Windows user.");
}

export function setWindowsOpenCodePluginEnabled(enabled: boolean, configDir?: string): WindowsInstallReport {
  const paths = resolveWindowsInstallPaths(configDir);
  setOpenCodePlusPlusPluginEnabled(enabled, paths.stateFile);
  return makeReport(enabled ? "enabled" : "disabled", paths, `OpenCode++ is now ${enabled ? "enabled" : "disabled"}.`);
}

export function getWindowsOpenCodePluginStatus(configDir?: string): WindowsInstallReport {
  const paths = resolveWindowsInstallPaths(configDir);
  return makeReport("status", paths, "OpenCode++ installation status.");
}

export async function runWindowsInstaller(argv: string[], payload: WindowsInstallerPayload): Promise<void> {
  if (process.platform !== "win32" && !argv.includes("--allow-non-windows")) {
    throw new Error("The OpenCode++ installer EXE is intended for Windows.");
  }
  const configDir = argumentValue(argv, "--config-dir");
  const report = argv.includes("--uninstall")
    ? uninstallWindowsOpenCodePlugin(configDir)
    : argv.includes("--status")
      ? getWindowsOpenCodePluginStatus(configDir)
      : argv.includes("--enable")
        ? setWindowsOpenCodePluginEnabled(true, configDir)
        : argv.includes("--disable")
          ? setWindowsOpenCodePluginEnabled(false, configDir)
          : installWindowsOpenCodePlugin(payload, configDir);
  const output = JSON.stringify(report, null, 2);
  if (argv.includes("--json") || argv.includes("--silent")) {
    console.log(output);
  } else {
    console.log(report.message);
    console.log(`Config: ${report.paths.configDir}`);
    console.log(`Plugin: ${report.pluginExists ? "installed" : "not installed"}`);
    console.log(`Enabled: ${report.enabled ? "yes" : "no"}`);
    if (report.action === "installed") showWindowsMessage(`${report.message}\n\nRestart or reload OpenCode Desktop to load the plugin.`, "OpenCode++");
  }
}

function makeReport(action: WindowsInstallReport["action"], paths: WindowsInstallPaths, message: string): WindowsInstallReport {
  const status = readOpenCodePlusPlusPluginStatus(paths.stateFile);
  return {
    action,
    ok: action === "uninstalled" || existsSync(paths.pluginFile),
    version: getOpenCodePlusplusPackageVersion(),
    paths,
    pluginExists: existsSync(paths.pluginFile),
    enabled: status.enabled,
    commandsInstalled: paths.commandFiles.filter(existsSync).length,
    agentFilesInstalled: [...paths.agentCommandFiles, paths.skillFile].filter(existsSync).length,
    message
  };
}

function defaultOpenCodeConfigDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "opencode");
}

function argumentValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function nativeCommandFiles(): string[] {
  return [
    "---\ndescription: OpenCode++ enable (local, no model)\n---\n\nEnable OpenCode++ locally.\n",
    "---\ndescription: OpenCode++ disable (local, no model)\n---\n\nDisable OpenCode++ locally.\n",
    "---\ndescription: OpenCode++ status (local, no model)\n---\n\nShow OpenCode++ local status.\n"
  ];
}

function removeEmptyDirectory(directory: string): void {
  try {
    if (existsSync(directory) && statSync(directory).isDirectory() && readdirSync(directory).length === 0) rmSync(directory, { recursive: false, force: true });
  } catch {
    // Keep user-created files and directories intact.
  }
}

function showWindowsMessage(message: string, title: string): void {
  if (process.platform !== "win32") return;
  const script = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show(${JSON.stringify(message)}, ${JSON.stringify(title)}) | Out-Null`;
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { stdio: "ignore" });
}
