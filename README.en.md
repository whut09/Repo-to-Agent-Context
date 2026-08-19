# OpenCode++

[中文](README.md) | English

**A Windows plugin, evidence layer, and harness for the official OpenCode Desktop application.**

OpenCode++ does not replace the official OpenCode Desktop application, and it does not install a second desktop shell. The Windows EXE installs a self-contained global plugin and state file in the current user's OpenCode configuration directory, then applies a narrow host patch for three exact OpenCode++ command names. Daily coding stays inside OpenCode Desktop.

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

OpenCode Slash Commands are normally model prompt templates. The installer patches the host dispatcher for three exact OpenCode++ command names, so `/opencode-plusplus-status`, `/opencode-plusplus-on`, and `/opencode-plusplus-off` read or update local state without a model turn when the patch is active. Other Slash Commands are unchanged. The EXE flags remain available for control outside Desktop.

When enabled, the plugin checks dangerous commands, unknown scripts, and protected paths before tool execution; records exit codes, redacted output, sessions, and working-tree hashes after execution; and runs incremental verification when a session becomes idle. Disabling pauses protection, evidence, and idle verification while keeping the controls available.

## Principles and Boundaries

- The EXE only modifies the marker-checked command dispatcher in `app.asar`, keeps a restorable backup, and does not modify the renderer, updater, or account login.
- The current OpenCode plugin API has no public third-party settings panel or model-free direct-command extension point. The host patch supplies only three explicit local commands; Desktop tools remain model-mediated.
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

## Product Boundary

The only runtime product is the Windows plugin for the official OpenCode Desktop: download the EXE, double-click to install, restart OpenCode Desktop. There is no other installation or usage path. `src/integrations/opencode/global-plugin.ts` is the single production runtime entry; the EXE install flow and the `opencode_plusplus_*` tool names are unchanged.

The CLI (`opencode-plusplus`) and MCP server (`opencode-plusplus-mcp`) are internal dev/test compatibility surfaces: they exist for CI, source builds, diagnostics, and harness-led batch runs. They stay in the npm package only as development dependencies and are **not a Desktop user installation or usage path**. The npm package itself is a developer tool; Desktop users never run `npm install`.

### CLI internal uses (not a user entry)

```powershell
opencode-plusplus build .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "fix the login timeout and add a regression test" . --executor mock --max-loops 3
```

CLI, MCP, and the Desktop plugin share Guard, Evidence, Policy, Decision, and Loop Engineering implementations, but their control boundaries differ: the Desktop plugin observes the current OpenCode session, while the harness-led CLI owns bounded execution, collection, and termination decisions. The internal role of CLI/MCP and the deletion details are in [Product Boundary](docs/developer/product-boundary.md).

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
- [Product boundary (CLI/MCP internal roles)](docs/developer/product-boundary.md)
- [Global sidecar runtime](docs/integrations/opencode-sidecar.md)
- [Architecture](docs/concepts/architecture.md)
- [Integration modes](docs/concepts/integration-modes.md)
- [Loop Engineering](docs/concepts/loop-engineering.md)
- [CLI reference](docs/reference/cli-reference.md)
- [Configuration reference](docs/reference/config.md)
- [Release checklist](docs/release.md)

License: [MIT](LICENSE).
