import { homedir } from "node:os";
import path from "node:path";
import { readJsonDiagnostic, writeJsonAtomicWithRevision } from "../../../core/atomic-store.js";
import { getOpenCodePlusplusPackageVersion } from "../../../core/package-info.js";

export const OPENCODE_PLUSPLUS_PLUGIN_STATE_SCHEMA_VERSION = 1;

export interface OpenCodePlusPlusPluginState {
  schemaVersion: typeof OPENCODE_PLUSPLUS_PLUGIN_STATE_SCHEMA_VERSION;
  revision: number;
  enabled: boolean;
  version: string;
  installedAt: string;
  updatedAt: string;
}

export interface OpenCodePlusPlusPluginStatus {
  installed: boolean;
  enabled: boolean;
  version: string;
  stateFile: string;
  revision: number;
  installedAt: string | null;
  updatedAt: string | null;
  diagnostic: string | null;
}

export function defaultOpenCodePlusPlusStateFile(): string {
  const configDir = process.env.OPENCODE_CONFIG_DIR;
  const opencodeDir = configDir || path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "opencode");
  return path.join(opencodeDir, "opencode-plusplus", "state.json");
}

export function readOpenCodePlusPlusPluginStatus(stateFile = defaultOpenCodePlusPlusStateFile()): OpenCodePlusPlusPluginStatus {
  const result = readJsonDiagnostic<OpenCodePlusPlusPluginState>(stateFile);
  const version = getOpenCodePlusplusPackageVersion();
  if (result.status === "missing") {
    return {
      installed: false,
      enabled: true,
      version,
      stateFile,
      revision: 0,
      installedAt: null,
      updatedAt: null,
      diagnostic: null
    };
  }
  if (result.status === "corrupt") {
    return {
      installed: true,
      enabled: true,
      version,
      stateFile,
      revision: 0,
      installedAt: null,
      updatedAt: null,
      diagnostic: `State file is corrupt; protection remains enabled: ${result.error}`
    };
  }

  const state = result.value;
  if (state.schemaVersion !== OPENCODE_PLUSPLUS_PLUGIN_STATE_SCHEMA_VERSION) {
    return {
      installed: true,
      enabled: true,
      version: state.version || version,
      stateFile,
      revision: state.revision || 0,
      installedAt: state.installedAt || null,
      updatedAt: state.updatedAt || null,
      diagnostic: `Unsupported state schema ${String(state.schemaVersion)}; protection remains enabled.`
    };
  }
  return {
    installed: true,
    enabled: state.enabled !== false,
    version: state.version || version,
    stateFile,
    revision: state.revision || 0,
    installedAt: state.installedAt || null,
    updatedAt: state.updatedAt || null,
    diagnostic: null
  };
}

export function setOpenCodePlusPlusPluginEnabled(
  enabled: boolean,
  stateFile = defaultOpenCodePlusPlusStateFile()
): OpenCodePlusPlusPluginStatus {
  const current = readOpenCodePlusPlusPluginStatus(stateFile);
  const now = new Date().toISOString();
  writeJsonAtomicWithRevision(
    stateFile,
    {
      schemaVersion: OPENCODE_PLUSPLUS_PLUGIN_STATE_SCHEMA_VERSION,
      revision: current.revision,
      enabled,
      version: getOpenCodePlusplusPackageVersion(),
      installedAt: current.installedAt ?? now,
      updatedAt: now
    },
    current.revision
  );
  return readOpenCodePlusPlusPluginStatus(stateFile);
}

export function renderOpenCodePlusPlusPluginStatus(status: OpenCodePlusPlusPluginStatus): string {
  return [
    "OpenCode++ Plugin Status",
    "",
    `Installed: ${status.installed ? "yes" : "runtime loaded; state not initialized"}`,
    `Enabled: ${status.enabled ? "yes" : "no"}`,
    `Version: ${status.version}`,
    `Revision: ${status.revision}`,
    `State: ${status.stateFile}`,
    ...(status.updatedAt ? [`Updated: ${status.updatedAt}`] : []),
    ...(status.diagnostic ? [`Diagnostic: ${status.diagnostic}`] : [])
  ].join("\n");
}
