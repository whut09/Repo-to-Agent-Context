# OpenCode Desktop On Windows

[中文](opencode-desktop.zh-CN.md) | English

OpenCode++ is installed into the official OpenCode Desktop as a global user-level plugin. The user-facing integration is one primary agent mode named **OpenCode++**. The installer does not add Slash Commands and does not patch `app.asar`.

## Install

1. Fully exit OpenCode Desktop.
2. Download `opencode-plusplus-setup-win-x64.exe` from [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases).
3. Double-click the EXE and wait for the confirmation dialog.

![Installer confirmation](../images/opencode-plusplus-installer.png)

4. Restart OpenCode Desktop.
5. Open a repository and select **OpenCode++** in the mode picker.

![Mode picker](../images/opencode-plusplus-mode.png)

The installer is per-user and does not require Administrator permission. It uses `%USERPROFILE%\.config\opencode` by default and honors `OPENCODE_CONFIG_DIR` when set.

## What Gets Installed

```text
<OpenCode config>\plugins\opencode-plusplus.js
<OpenCode config>\agents\opencode-plusplus.md
<OpenCode config>\opencode-plusplus\state.json
<OpenCode config>\opencode-plusplus\installation.json
```

The agent file is a standard OpenCode `mode: primary` agent. OpenCode discovers it from the global `agents` directory and displays it in the mode picker beside Build and Plan. The plugin is loaded independently from the agent file, so the mode prompt and runtime tools remain separate concerns.

## Use The Mode

Select the mode, then describe the task normally. The mode instructs the active OpenCode model to:

1. retrieve relevant files when needed;
2. prepare a task and read every `mustInspect` file;
3. edit only within the returned boundaries;
4. run every required command with the built-in shell;
5. evaluate current evidence and working-tree freshness;
6. follow `next` until the Harness returns `finalize` or human review.

The model still performs the actual reading, editing, and command execution. OpenCode++ provides the context, rules, evidence, and decision tools. It does not start a second model or invoke its CLI from the Desktop plugin.

## State And Reports

The plugin state is stored under the OpenCode config directory. Repository runtime artifacts are stored under `.agent-context/`:

- `traces/`: normalized tool and test evidence;
- `runs/`: task context, boundaries, and iteration artifacts;
- `loops/`: decisions, missing evidence, and convergence state;
- `sidecar/latest.md`: latest verification summary.

These are runtime artifacts, not source files. Add `.agent-context/` to local Git exclusions when appropriate and never commit credentials or command output containing secrets.

## Upgrade And Legacy Cleanup

Close OpenCode Desktop before running a newer EXE. The installer replaces the plugin, refreshes `agents/opencode-plusplus.md`, preserves the valid enabled state, and removes files created by older releases:

- `commands/opencode-plusplus-status.md`, `opencode-plusplus-on.md`, and `opencode-plusplus-off.md`;
- `commands/plusplus-task.md` and `commands/plusplus-verify.md`;
- `skills/opencode-plusplus/SKILL.md`;
- the old OpenCode++ `app.asar` patch and its backup, when detected.

After the upgrade, restart OpenCode and choose the mode again. If the mode is missing, check the active config directory and whether another config file is overriding the OpenCode config root.

## Boundaries

- The plugin observes OpenCode tool hooks; it is not an operating-system sandbox.
- It cannot prevent another process from editing files.
- Command success does not prove semantic correctness.
- Manual, stale, or superseded evidence may remain blocking under the configured evidence policy.
- It does not automatically commit, push, merge, or destructively roll back the repository.

## Customize It

Fork the repository or add a project-level agent when you need a different Harness. Customize the agent prompt, retrieval ranking, command guards, evidence policy, or loop decision logic, then add tests and rebuild the Windows installer. See [Windows plugin architecture](../concepts/windows-plugin-architecture.md) and [customization guidance](../../README.md#customize-your-own-harness).

CLI and MCP documentation is kept for developers and compatibility integrations only.
