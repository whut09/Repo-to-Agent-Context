# OpenCode++

[中文](README.md) | English

**A Windows Harness plugin for the official OpenCode Desktop application.**

OpenCode++ does not provide a second desktop application, and ordinary users do not install an npm package or use a command line. The release EXE installs a self-contained plugin in the current user's OpenCode configuration and applies a narrow `app.asar` patch for three local status commands. Daily use stays entirely inside the official OpenCode Desktop application.

## Install

1. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
2. Fully exit OpenCode Desktop.
3. Double-click the EXE and wait for installation to complete.
4. Reopen OpenCode Desktop and open the target repository.
5. Start a session and type `/plusplus-task <task>`.

The installer is per-user and does not require Administrator permission. It uses `%USERPROFILE%\.config\opencode` by default and honors the `OPENCODE_CONFIG_DIR` or `XDG_CONFIG_HOME` already used by OpenCode.

## Use The Harness In Desktop

- `/plusplus-task <task>` calls `opencode_plusplus_prepare`, reads `mustInspect`, enforces edit boundaries, runs `requiredCommands`, then calls `opencode_plusplus_evaluate` and `opencode_plusplus_next`.
- `/plusplus-verify` evaluates the current task again and shows blockers, missing evidence, required commands, and the next action.
- `opencode_plusplus_retrieve` returns task-relevant files and score breakdowns before blind search.
- A task is complete only when `opencode_plusplus_next` returns `finalize` with no blocker.

These Harness tools run in the Desktop plugin process. They do not start the OpenCode++ CLI or independently call another paid agent.

## Status And Controls

Use these directly in OpenCode Desktop:

| Slash Command               | Result                                                  |
| --------------------------- | ------------------------------------------------------- |
| `/opencode-plusplus-status` | Shows installation, enabled, version, and patch state   |
| `/opencode-plusplus-on`     | Enables guards, evidence capture, and idle verification |
| `/opencode-plusplus-off`    | Pauses guards, evidence capture, and idle verification  |

The installer patch handles these three commands locally. They do not call the model or execute a shell. `/plusplus-task` and `/plusplus-verify` are Harness workflow prompts that ask the current session model to invoke the plugin tools.

## Inspect Reports

The plugin writes local runtime reports under `.agent-context/` in the current repository:

- `.agent-context/sidecar/latest.md`: latest idle verification summary;
- `.agent-context/traces/`: execution evidence with `eventId`, `sequence`, and session/task identity;
- `.agent-context/runs/`: task context, edit boundaries, and verification state;
- `.agent-context/loops/`: next-action and blocker decisions.

These directories are local runtime artifacts and are excluded from Git and npm releases by default. Uninstalling the plugin does not delete historical repository reports.

## Principles And Boundaries

- The EXE patches only the marker-checked `SessionPrompt.command` dispatcher and retains a restorable original backup.
- The plugin observes tools and events exposed by OpenCode. It is not an operating-system sandbox and cannot stop another application from editing files.
- Guards check dangerous commands, unknown scripts, and protected paths. Evidence stores redacted, truncated results; it is not proof of complete business correctness.
- State, session, trace, and report files use locked atomic writes. Ordinary artifact failures do not crash OpenCode Desktop hooks.
- Windows release verification covers EXE size, SHA256, plugin bundle loading, three local commands, patch marker, backup, and uninstall restoration.

Detailed documentation:

- [Windows installation and usage](docs/integrations/opencode-desktop.md)
- [Windows plugin architecture and boundaries](docs/concepts/windows-plugin-architecture.md)
- [Generated files and commit policy](docs/reference/generated-files.md)
- [Release checks](docs/release.md)

## Developer And Compatibility Surfaces

CLI and MCP remain only for source development, CI, diagnostics, and compatibility integrations. They are not ordinary user installation or usage paths. See [Product Boundary](docs/developer/product-boundary.md) and [Release checks](docs/release.md) for source builds and the complete gate.

The deterministic Desktop benchmark makes no paid model calls:

```powershell
npm ci
npm run benchmark:desktop
```

License: [MIT](LICENSE).
