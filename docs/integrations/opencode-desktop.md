# OpenCode Desktop on Windows

[中文](opencode-desktop.zh-CN.md) | English

OpenCode++ integrates with the official OpenCode Desktop through its user-level plugin directory. It does not patch the Desktop executable, renderer, updater, account system, or installation directory.

## Install

1. Close OpenCode Desktop completely.
2. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
3. Double-click the EXE. Administrator elevation is not required.
4. Reopen OpenCode Desktop and open a repository.
5. Start a new session and confirm the `opencode_plusplus_status` tool is available.

The installer writes:

```text
<OpenCode config>\plugins\opencode-plusplus.js
<OpenCode config>\opencode-plusplus\state.json
<OpenCode config>\opencode-plusplus\installation.json
```

The default config directory is `%USERPROFILE%\.config\opencode`. `OPENCODE_CONFIG_DIR` takes precedence; `XDG_CONFIG_HOME` is also honored by the runtime. For an isolated installation, pass `--config-dir <path>`.

## Control and Status

| Action      | Desktop tool (model-mediated) | Direct local EXE command                        |
| ----------- | ----------------------------- | ----------------------------------------------- |
| Show status | `opencode_plusplus_status`    | `opencode-plusplus-setup-win-x64.exe --status`  |
| Enable      | `opencode_plusplus_enable`    | `opencode-plusplus-setup-win-x64.exe --enable`  |
| Disable     | `opencode_plusplus_disable`   | `opencode-plusplus-setup-win-x64.exe --disable` |

OpenCode Markdown Slash Commands are prompt templates. They are sent to the selected model and cannot directly execute local plugin code or render a native status panel. OpenCode++ therefore does not install `/opencode-plusplus-status`, `/opencode-plusplus-on`, or `/opencode-plusplus-off`. The Desktop tools are available to the agent, so asking the agent to use one still involves a model turn. Use the EXE commands when status or control must be local and model-free.

Disable is a pause, not an uninstall. The plugin remains loaded so status and enable remain available. Install and upgrade require a full OpenCode restart because the host must reload the plugin module.

## What the Plugin Does

When enabled, the plugin:

- checks command syntax, known package scripts, dangerous shell operations, protected paths, and secret-like paths before execution;
- records tool, command, exit code, timestamps, changed paths, working-tree hashes, and redacted/truncated output after execution;
- writes trace and event artifacts under the current repository's `.agent-context/`;
- runs the shared incremental verification stack after file edits and an idle session;
- exposes status, enable, and disable controls as normal OpenCode plugin tools.

## What It Cannot Do

- It cannot add a native OpenCode Desktop settings page; OpenCode++ does not assume a public third-party settings-panel API.
- It cannot sandbox processes or control edits made by another application.
- It cannot prove semantic correctness from a command exit code alone.
- It cannot guarantee that opaque tool arguments are fully classified.
- It does not automatically commit, push, merge, or destructively rollback the user's working tree.

## Upgrade

Close OpenCode Desktop and run the newer EXE. The installer atomically replaces the bundled plugin, removes legacy prompt-command files from older releases, updates `installation.json`, and preserves an existing valid enabled state.

If a previous project-level integration left `.opencode/plugins/opencode-plusplus.ts` in a repository, remove that legacy file after installing the global plugin. Keeping both can load the same hooks twice.

## Uninstall

```powershell
opencode-plusplus-setup-win-x64.exe --uninstall
```

Uninstall removes only files written by the installer. It does not remove repository `.agent-context/` data, source code, OpenCode Desktop, or other plugins.

## Diagnostics

```powershell
opencode-plusplus-setup-win-x64.exe --status --json
opencode-plusplus-setup-win-x64.exe --disable --json
opencode-plusplus-setup-win-x64.exe --enable --json
opencode-plusplus-setup-win-x64.exe --config-dir "C:\Temp\opencode-config" --status --json
```

If the tools do not appear:

1. fully exit and restart OpenCode;
2. verify that the plugin file exists in the active OpenCode config directory;
3. start a new repository session;
4. run the EXE with `--status --json`;
5. remove the legacy project plugin if present.

## Build From Source

On Windows with Node.js 20+:

```powershell
npm ci
npm run check
npm run build:installer:windows
```

The build emits `release/opencode-plusplus-setup-win-x64.exe` and a SHA256 file. It minifies and compresses the global plugin, then embeds it in a compact .NET Framework installer. The EXE does not carry a Node or Electron runtime and does not require the source checkout. Supported Windows 10/11 systems already include the required .NET Framework 4.x runtime. The published binary is not commercially code-signed, so verify the release SHA256 before bypassing a SmartScreen warning.
