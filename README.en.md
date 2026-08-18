# OpenCode++

[中文](README.md) | English

**A Windows plugin, evidence layer, and harness for the official OpenCode Desktop application.**

OpenCode++ does not modify or replace the official OpenCode Desktop application, and it does not install a second desktop shell. The Windows EXE installs a self-contained global plugin and state file in the current user's OpenCode configuration directory. Daily coding stays inside OpenCode Desktop.

## Five-Minute Install

1. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
2. Fully exit OpenCode Desktop.
3. Double-click the EXE and wait for the completion message.
4. Reopen OpenCode Desktop, open the target repository, and start a session.
5. Confirm that `opencode_plusplus_status` appears in the tool list.

The installer writes only to the current Windows user directory and does not require administrator privileges. The default location is `%USERPROFILE%\.config\opencode`; `OPENCODE_CONFIG_DIR` or `XDG_CONFIG_HOME` is honored when OpenCode uses a custom configuration directory.

## Status and Controls

| Action      | Desktop tool (model-mediated) | Direct local EXE option |
| ----------- | ----------------------------- | ----------------------- |
| Show status | `opencode_plusplus_status`    | `--status`              |
| Enable      | `opencode_plusplus_enable`    | `--enable`              |
| Disable     | `opencode_plusplus_disable`   | `--disable`             |

OpenCode Slash Commands are model prompt templates, not local plugin commands. OpenCode++ no longer installs control Slash Commands. Run `opencode-plusplus-setup-win-x64.exe --status|--enable|--disable` when control must be local and model-free.

When enabled, the plugin checks dangerous commands, unknown scripts, and protected paths before tool execution; records exit codes, redacted output, sessions, and working-tree hashes after execution; and runs incremental verification when a session becomes idle. Disabling pauses protection, evidence, and idle verification while keeping the controls available.

## Principles and Boundaries

- The EXE does not modify the OpenCode Desktop binary, installation directory, renderer, updater, or account login.
- The current OpenCode plugin API has no public third-party settings panel or model-free direct-command extension point. Desktop tools are model-mediated; the EXE provides direct local control.
- The plugin observes only OpenCode-exposed tools and events. It is not an operating-system sandbox and cannot stop another program from editing files.
- Guards enforce command and path boundaries, not a complete security audit. Opaque tool arguments may produce evidence or warnings instead of a block.
- Evidence is redacted and truncated. It proves what the system captured; it does not prove complete business coverage.
- Repository runtime reports are written to `.agent-context/`. Uninstalling the plugin does not delete historical artifacts.

Read [Windows plugin architecture and boundaries](docs/concepts/windows-plugin-architecture.md) for the complete model.

## Installation and Repository Files

User-level installation files:

```text
%USERPROFILE%\.config\opencode\plugins\opencode-plusplus.js
%USERPROFILE%\.config\opencode\opencode-plusplus\state.json
```

Harness files in the target repository live under `.agent-context/` and include context, trace, evidence, policy, guard, loop, and orchestrator artifacts. They are not OpenCode Desktop installation files.

## Upgrade, Disable, and Uninstall

- **Upgrade**: exit OpenCode, download the newer EXE, and double-click it. The installer replaces the plugin, removes legacy prompt commands, and preserves a valid enabled state.
- **Temporarily disable**: use the EXE `--disable` option and restore with `--enable`, or ask the agent to call the matching tool.
- **Uninstall**: run the EXE with `--uninstall`. It removes only OpenCode++ plugin, legacy command, state, and manifest files, not `.agent-context/`.
- **Check status**: run the EXE with `--status --json`, or call the status tool in OpenCode.

## Advanced Harness and CLI

The CLI is not the daily Desktop entry point. It is used for CI, repository context generation, diagnostics, MCP, and harness-led batch runs:

```powershell
opencode-plusplus build .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "fix the login timeout and add a regression test" . --executor mock --max-loops 3
```

CLI, MCP, and the Desktop plugin share Guard, Evidence, Policy, Decision, and Loop Engineering implementations, but their control boundaries differ: the Desktop plugin observes the current OpenCode session, while the harness-led CLI owns bounded execution, collection, and termination decisions.

## Build the Windows EXE

Requires Windows, Node.js 20+, and npm:

```powershell
npm ci
npm run check
npm run build
npm run build:installer:windows
```

The outputs are `release/opencode-plusplus-setup-win-x64.exe` and its `.sha256` file. The build compresses the plugin into a compact .NET Framework installer without bundling Node or Electron, and it does not depend on an absolute path to this repository.

## Documentation

- [Windows installation and usage](docs/integrations/opencode-desktop.md)
- [Windows plugin architecture and boundaries](docs/concepts/windows-plugin-architecture.md)
- [Global sidecar runtime](docs/integrations/opencode-sidecar.md)
- [Architecture](docs/concepts/architecture.md)
- [Integration modes](docs/concepts/integration-modes.md)
- [Loop Engineering](docs/concepts/loop-engineering.md)
- [CLI reference](docs/reference/cli-reference.md)
- [Configuration reference](docs/reference/config.md)
- [Release checklist](docs/release.md)

License: [MIT](LICENSE).
