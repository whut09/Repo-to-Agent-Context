# OpenCode++

[中文](README.md) | English

**A reliability plugin and harness for the official OpenCode Desktop application.**

OpenCode++ does not patch OpenCode Desktop. It uses the user-level OpenCode plugin boundary to provide command guards, tool evidence, context verification, policy gates, and repair-loop reports.

## 30-Second Start

1. Install and open the official OpenCode Desktop application.
2. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
3. Double-click the EXE, then fully restart OpenCode Desktop.
4. Open a repository in Desktop and start a chat.

The installer writes only to the current user's OpenCode configuration directory and does not require administrator privileges. Daily use does not require this repository's CLI or a separate OpenCode++ desktop shell.

## Desktop Controls

Once loaded, the plugin exposes these tools in OpenCode:

```text
opencode_plusplus_status
opencode_plusplus_enable
opencode_plusplus_disable
```

It also registers these slash commands:

```text
/opencode-plusplus-status
/opencode-plusplus-on
/opencode-plusplus-off
```

When enabled, OpenCode++ checks dangerous commands and protected paths before execution, records exit codes, sanitized output summaries, sessions, and working-tree hashes after execution, and runs incremental verification when an edited session becomes idle. Disabling it keeps the control tools available while pausing protection and verification.

See [OpenCode Desktop installation and usage](docs/integrations/opencode-desktop.zh-CN.md) for installation, upgrade, uninstall, and troubleshooting details.

## Advanced Harness

Use the CLI when OpenCode++ should own a bounded batch loop:

```powershell
opencode-plusplus oc run "fix the login timeout and add a regression test" . --max-loops 3
opencode-plusplus oc report --last
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
```

CLI, MCP, and the Desktop plugin share the same Guard, Evidence, Policy, Decision, and Loop Engineering implementations. Batch mode produces explicit `finalize`, `repair`, `repack`, `block`, `rollback`, or `human-review` decisions.

## Build From Source

```powershell
npm ci
npm run check
npm run build
npm run build:installer:windows
```

The Windows installer is written to `release/opencode-plusplus-setup-win-x64.exe`. Node SEA embeds the global plugin so the EXE does not depend on a repository absolute path.

## Documentation

- [OpenCode Desktop installation and usage](docs/integrations/opencode-desktop.zh-CN.md)
- [OpenCode Global Sidecar](docs/integrations/opencode-sidecar.md)
- [Architecture](docs/concepts/architecture.md)
- [Integration Modes](docs/concepts/integration-modes.md)
- [Loop Engineering](docs/concepts/loop-engineering.md)
- [CLI Reference](docs/reference/cli-reference.md)
- [MCP Tools](docs/reference/mcp-tools.md)
- [Release Checklist](docs/release.md)
