# Getting Started

[中文](getting-started.zh-CN.md) | English

## Recommended Windows Path

OpenCode++ is primarily used as a plugin inside the official OpenCode Desktop application.

1. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
2. Exit OpenCode Desktop completely before installation or upgrade.
3. Double-click the EXE, then restart OpenCode Desktop.
4. Open a repository and call `opencode_plusplus_status` or `/opencode-plusplus-status`.

The installer is per-user, does not need Administrator permission, and writes to the OpenCode configuration directory. Read [Windows installation and usage](integrations/opencode-desktop.md) for paths, custom configuration directories, upgrade, uninstall, and troubleshooting.

## First Session Checklist

1. Call the status tool and confirm the plugin version and `Enabled: yes`.
2. Keep the plugin enabled while editing so command/path guards and evidence capture are active.
3. After a meaningful edit, wait for the session to become idle and inspect `.agent-context/sidecar/latest.md`.
4. Use `/opencode-plusplus-off` only when you intentionally need an unguarded session; turn it back on afterward.

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
