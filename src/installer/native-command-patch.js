const OPENCODE_PLUSPLUS_NATIVE_COMMANDS = new Set([
  "opencode-plusplus-on",
  "opencode-plusplus-off",
  "opencode-plusplus-status"
]);

function opencodePlusPlusConfigDirectory() {
  const configured = process.env.OPENCODE_CONFIG_DIR;
  if (configured) return configured;
  const xdg = process.env.XDG_CONFIG_HOME || path79__default.join(os23__default.homedir(), ".config");
  return path79__default.join(xdg, "opencode");
}

function opencodePlusPlusNativeControl(command) {
  const configDirectory = opencodePlusPlusConfigDirectory();
  const statePath = path79__default.join(configDirectory, "opencode-plusplus", "state.json");
  const pluginPath = path79__default.join(configDirectory, "plugins", "opencode-plusplus.js");
  let state = { schemaVersion: 1, revision: 0, enabled: true };
  let diagnostic;
  if (NFS__default.existsSync(statePath)) {
    try {
      state = { ...state, ...JSON.parse(NFS__default.readFileSync(statePath, "utf8")) };
    } catch (error) {
      diagnostic = error instanceof Error ? error.message : String(error);
    }
  }
  if (diagnostic && command !== "opencode-plusplus-status") {
    return `OpenCode++ state is corrupt and was not changed: ${diagnostic}`;
  }
  if (command === "opencode-plusplus-on" || command === "opencode-plusplus-off") {
    state.enabled = command === "opencode-plusplus-on";
    state.revision = Number(state.revision || 0) + 1;
    state.updatedAt = new Date().toISOString();
    const directory = path79__default.dirname(statePath);
    const temporaryPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
    NFS__default.mkdirSync(directory, { recursive: true });
    NFS__default.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    NFS__default.renameSync(temporaryPath, statePath);
  }
  const installed = NFS__default.existsSync(pluginPath);
  return [
    "OpenCode++ local status",
    `Installed: ${installed ? "yes" : "no"}`,
    `Enabled: ${state.enabled !== false ? "yes" : "no"}`,
    `Version: ${state.version || "unknown"}`,
    "Native command patch: active",
    `Config: ${configDirectory}`,
    ...(diagnostic ? [`Diagnostic: ${diagnostic}`] : [])
  ].join("\n");
}

