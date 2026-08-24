# Getting Started

[中文](getting-started.zh-CN.md) | English

## Recommended Windows Path

OpenCode++ is primarily used as a plugin inside the official OpenCode Desktop application.

1. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
2. Exit OpenCode Desktop completely before installation or upgrade.
3. Double-click the EXE, then restart OpenCode Desktop.
4. Open a repository and type `/plusplus-task <task>` in a new session to run a task through the harness.

The installer is per-user, does not need Administrator permission, and writes to the OpenCode configuration directory. It also writes the global `/plusplus-task`, `/plusplus-verify` Slash Commands and the `opencode-plusplus` skill, so no command line is needed after restart. Read [Windows installation and usage](integrations/opencode-desktop.md) for paths, custom configuration directories, upgrade, uninstall, and troubleshooting.

## First Session Checklist

1. Type `/plusplus-task <task>` for a coding task, or `/plusplus-verify` to re-check the current harness state.
2. Keep the plugin enabled while editing so command/path guards and evidence capture are active.
3. After a meaningful edit, wait for the session to become idle and inspect `.agent-context/sidecar/latest.md`.
4. Use `/opencode-plusplus-status` to inspect state, `/opencode-plusplus-off` to pause protection, and `/opencode-plusplus-on` to restore it.

OpenCode Slash Commands are normally model prompts. The installer patches three exact OpenCode++ control commands (`/opencode-plusplus-status`, `/opencode-plusplus-on`, `/opencode-plusplus-off`) so they run locally in Desktop without a model turn. The harness workflow commands (`/plusplus-task`, `/plusplus-verify`) are model-mediated, and the EXE status/enable/disable options remain available outside Desktop.

## Developer And Compatibility Surfaces (CLI / MCP)

CLI and MCP are internal dev/test compatibility surfaces, not a user path. Desktop users install only from the EXE and never run `npm install`. Developers may use them for CI, scripts, repository context generation, diagnostics, or a harness-led loop that needs explicit artifacts and exit codes:

```powershell
npm ci
opencode-plusplus build .
opencode-plusplus status .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "fix the login timeout and add a regression test" . --executor mock --max-loops 3
```

See [Product Boundary](developer/product-boundary.md) for what is user-facing, what is internal, and what was removed.

## Local Development

```powershell
npm ci
npm run check
npm run build
npm test
npm run build:installer:windows
```

Repository runtime files are written to `.agent-context/`. `opencode-plusplus run "task" .` writes a task pack and trace without executing an external agent; `orchestrate` is the executor-owning flow.
