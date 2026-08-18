# Getting Started

[中文](getting-started.zh-CN.md) | English

## Recommended Windows Path

OpenCode++ is primarily used as a plugin inside the official OpenCode Desktop application.

1. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
2. Exit OpenCode Desktop completely before installation or upgrade.
3. Double-click the EXE, then restart OpenCode Desktop.
4. Open a repository and confirm the `opencode_plusplus_status` tool is available.

The installer is per-user, does not need Administrator permission, and writes to the OpenCode configuration directory. Read [Windows installation and usage](integrations/opencode-desktop.md) for paths, custom configuration directories, upgrade, uninstall, and troubleshooting.

## First Session Checklist

1. Run `opencode-plusplus-setup-win-x64.exe --status` for a direct local check, or ask the agent to call the status tool.
2. Keep the plugin enabled while editing so command/path guards and evidence capture are active.
3. After a meaningful edit, wait for the session to become idle and inspect `.agent-context/sidecar/latest.md`.
4. Use the EXE `--disable` option or the disable tool only when you intentionally need an unguarded session; turn it back on afterward.

OpenCode Slash Commands are normally model prompts. The installer patches three exact OpenCode++ commands so they run locally in Desktop without a model turn. Desktop tools remain model-mediated, and the EXE status/enable/disable options remain available outside Desktop.

## Advanced CLI

The CLI is a maintenance and automation surface, not a replacement UI:

```powershell
npm install --global opencode-plusplus
opencode-plusplus build .
opencode-plusplus status .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "fix the login timeout and add a regression test" . --executor mock --max-loops 3
```

Use CLI/MCP for CI, scripts, repository generation, or a harness-led loop that needs explicit artifacts and exit codes. Use the Desktop plugin for normal interactive coding.

## Local Development

```powershell
npm ci
npm run check
npm run build
npm test
npm run build:installer:windows
```

Repository runtime files are written to `.agent-context/`. `opencode-plusplus run "task" .` writes a task pack and trace without executing an external agent; `orchestrate` is the executor-owning flow.
