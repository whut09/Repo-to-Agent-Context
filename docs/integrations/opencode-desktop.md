# OpenCode Desktop on Windows

[中文](opencode-desktop.zh-CN.md) | English

OpenCode++ integrates with the official OpenCode Desktop through its user-level plugin directory and a narrowly scoped host patch. The patch only intercepts three OpenCode++ command names in the bundled `SessionPrompt.command` handler; it does not modify the renderer, updater, account system, authentication, or unrelated application logic.

This EXE is the only user-facing installation and usage path for OpenCode++. The CLI (`opencode-plusplus`) and MCP server (`opencode-plusplus-mcp`) remain in the repository as internal dev/test compatibility surfaces and never appear in the installer payload. The full boundary map is in [Product Boundary](../developer/product-boundary.md).

## Install

1. Close OpenCode Desktop completely.
2. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
3. Double-click the EXE. Administrator elevation is not required.
4. Reopen OpenCode Desktop and open a repository.
5. Start a new session and type `/plusplus-task <task>` to run a coding task through the harness.

The installer writes:

```text
<OpenCode config>\plugins\opencode-plusplus.js
<OpenCode config>\opencode-plusplus\state.json
<OpenCode config>\opencode-plusplus\installation.json
<OpenCode config>\commands\opencode-plusplus-on.md
<OpenCode config>\commands\opencode-plusplus-off.md
<OpenCode config>\commands\opencode-plusplus-status.md
<OpenCode config>\commands\plusplus-task.md
<OpenCode config>\commands\plusplus-verify.md
<OpenCode config>\skills\opencode-plusplus\SKILL.md
```

The default config directory is `%USERPROFILE%\.config\opencode`. `OPENCODE_CONFIG_DIR` takes precedence; `XDG_CONFIG_HOME` is also honored by the runtime. For an isolated installation, pass `--config-dir <path>`.

## Harness Workflow

After restart, the session exposes `/plusplus-task` and `/plusplus-verify` as normal model-mediated slash commands, plus the `opencode-plusplus` skill that OpenCode loads automatically for concrete coding work. No command line is required:

- `/plusplus-task <task>` runs the task through the harness workflow: `opencode_plusplus_prepare` → read `mustInspect` files → edit only inside `allowedEditGlobs` → run `requiredCommands` with the built-in shell tool → `opencode_plusplus_evaluate` → `opencode_plusplus_next`. The model must not claim completion while `nextAction` is not `finalize`.
- `/plusplus-verify` re-runs `opencode_plusplus_evaluate` and `opencode_plusplus_next`, then reports blocking state, missing evidence, and the commands that still must run.
- The skill steers the model to the right tool at the right moment and treats a blocking evaluation as not-complete.

## Control and Status

| Action      | Desktop tool (model-mediated) | Direct local EXE command                        |
| ----------- | ----------------------------- | ----------------------------------------------- |
| Show status | `opencode_plusplus_status`    | `opencode-plusplus-setup-win-x64.exe --status`  |
| Enable      | `opencode_plusplus_enable`    | `opencode-plusplus-setup-win-x64.exe --enable`  |
| Disable     | `opencode_plusplus_disable`   | `opencode-plusplus-setup-win-x64.exe --disable` |

OpenCode Markdown commands normally are prompt templates, but the installer patches the host command dispatcher for these exact names. When the patch is active, `/opencode-plusplus-status`, `/opencode-plusplus-on`, and `/opencode-plusplus-off` are intercepted before template expansion and directly read or update the local state file. They append a local assistant result to the current session and do not call the model or execute a shell command. Other Markdown commands retain normal OpenCode behavior.

Disable is a pause, not an uninstall. The plugin remains loaded so status and enable remain available. Install and upgrade require a full OpenCode restart because the host must reload the plugin module.

## Patch Boundary

- The installer requires a supported Desktop bundle containing the expected `SessionPrompt.command` marker.
- OpenCode must be fully closed while installing or uninstalling because `app.asar` is replaced atomically.
- The original `app.asar` is saved beside the bundle as `app.asar.opencode-plusplus.original` and restored on uninstall.
- If OpenCode updates and replaces `app.asar`, the native commands disappear until the installer is run again. The installer detects the missing marker and creates a new backup before patching the new bundle.
- An unsupported or changed bundle is rejected without writing the command files.

## What the Plugin Does

When enabled, the plugin:

- checks command syntax, known package scripts, dangerous shell operations, protected paths, and secret-like paths before execution;
- records tool, command, exit code, timestamps, changed paths, working-tree hashes, and redacted/truncated output after execution;
- writes trace and event artifacts under the current repository's `.agent-context/`;
- runs the shared incremental verification stack after file edits and an idle session;
- exposes status, enable, and disable controls as normal OpenCode plugin tools;
- exposes `opencode_plusplus_prepare`, `opencode_plusplus_retrieve`, `opencode_plusplus_evaluate`, and `opencode_plusplus_next` as the in-session harness workflow behind `/plusplus-task` and `/plusplus-verify`.

## What It Cannot Do

- It cannot add a native OpenCode Desktop settings page; the native command patch is intentionally limited to the three slash commands.
- It cannot sandbox processes or control edits made by another application.
- It cannot prove semantic correctness from a command exit code alone.
- It cannot guarantee that opaque tool arguments are fully classified.
- It does not automatically commit, push, merge, or destructively rollback the user's working tree.

## Upgrade

Close OpenCode Desktop and run the newer EXE. The installer updates the bundled plugin, verifies or reapplies the host command patch, writes the three native command menu entries plus the `/plusplus-task` and `/plusplus-verify` commands and the `opencode-plusplus` skill, updates `installation.json`, and preserves an existing valid enabled state.

If a previous project-level integration left `.opencode/plugins/opencode-plusplus.ts` in a repository, remove that legacy file after installing the global plugin. Keeping both can load the same hooks twice. Legacy repository commands `.opencode/commands/opencode-plusplus.md` and `.opencode/commands/opencode-plusplus-verify.md` invoke the CLI and are no longer generated; delete them or re-run `opencode-plusplus opencode init .` to get the aligned `/plusplus-task` and `/plusplus-verify` versions.

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
5. remove the legacy project plugin if present;
6. run the installer again after every OpenCode Desktop update.

## Build From Source

On Windows with Node.js 20+:

```powershell
npm ci
npm run check
npm run build:installer:windows
```

The build emits `release/opencode-plusplus-setup-win-x64.exe` and a SHA256 file. It minifies and compresses the global plugin, then embeds it in a compact .NET Framework installer. The EXE does not carry a Node or Electron runtime and does not require the source checkout. Supported Windows 10/11 systems already include the required .NET Framework 4.x runtime. The published binary is not commercially code-signed, so verify the release SHA256 before bypassing a SmartScreen warning.
