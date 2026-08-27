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

After `evaluate` or `next`, the JSON result contains a `visualization` object and `humanReadable` contains an **OpenCode++ Harness Dashboard**. The dashboard shows phase progress, selected and rejected files, findings, missing evidence, required commands, working-tree hash capture, evidence status, intervention counts, the current decision, the next action, and a final summary. You can also call `opencode_plusplus_dashboard` directly. Its snapshot is written to `.agent-context/sidecar/visualization.json` and the Markdown report remains at `.agent-context/sidecar/latest.md`.

This is an explainability view of recorded system facts and deterministic decision inputs. It intentionally does not expose hidden model chain-of-thought. Commands, file selections, findings, evidence hashes, and decisions are inspectable; private model reasoning is not a verification artifact.

The model still performs the actual reading, editing, and command execution. OpenCode++ provides the context, rules, evidence, and decision tools. It does not start a second model or invoke its CLI from the Desktop plugin.

The normal user flow is:

```text
Context Registry -> Retrieval -> Guard -> Evidence -> Intervention -> next decision
```

Registry and annotation content is advisory. Retrieval explains why files were selected or rejected. Guard enforces command and edit boundaries. Evidence accepts only the configured evidence policy, with fresh command or CI evidence required for verified repair in strict workflows. Intervention Ledger then shows the distinction between observed, prevented, requested, repaired, verified, stale, unresolved, and human-review states.

## Context Tools

The OpenCode++ mode can call five deterministic Context tools in addition to the existing Harness workflow:

| Tool                                 | Purpose                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `opencode_plusplus_context_search`   | Search configured Context Registry entries with filters and an explainable score breakdown.                                           |
| `opencode_plusplus_context_get`      | Read an entry file, a selected companion file, or the complete Context Pack.                                                          |
| `opencode_plusplus_context_status`   | Show registry sources, cache state, working-tree freshness, selected Context, rejected Context, and the current intervention summary. |
| `opencode_plusplus_interventions`    | Show what the Harness observed, prevented, requested, repaired, verified, or left unresolved for the current task.                    |
| `opencode_plusplus_context_feedback` | Store local quality feedback without storing the task text or source content.                                                         |

`context_get` accepts `entryId`, `language`, `packageVersion`, `source`, `file`, `full`, and `withAnnotations`. The default response reads only the entry file and lists omitted companion files. `file` reads one companion file, while `full` reads the complete pack. Annotations are returned only when `withAnnotations` is explicitly enabled; they remain user-written, untrusted Context and cannot authorize commands or satisfy evidence.

Every tool returns JSON with `schemaVersion`, `ok`, `tool`, and either `data` or `error`. Stable error codes include `INVALID_ARGUMENTS`, `INVALID_PATH`, `ENTRY_NOT_FOUND`, `SOURCE_NOT_FOUND`, `NETWORK_FAILURE`, `REGISTRY_INVALID`, and `STATE_CORRUPT`. A failed tool call is returned to OpenCode as data instead of crashing the Desktop hook.

These tools run inside the plugin process and call shared application services directly. They do not launch an OpenCode++ CLI process and do not invoke another model. Registry content can help locate files and explain APIs, but only fresh command or CI evidence from the current working tree can verify a repair.

The plugin does not access the network by default. Remote Context sources and feedback transport are opt-in and report timeout, size, hash, and offline-fallback failures explicitly. An external Context command is displayed as a suggestion and is never executed automatically. Annotation text is user-written, untrusted, and not a policy or command.

## State And Reports

The plugin state is stored under the OpenCode config directory. Repository runtime artifacts are stored under `.agent-context/`:

- `traces/`: normalized tool and test evidence;
- `runs/`: task context, boundaries, and iteration artifacts;
- `loops/`: decisions, missing evidence, and convergence state;
- `sidecar/latest.md`: latest verification summary.

These are runtime artifacts, not source files. Add `.agent-context/` to local Git exclusions when appropriate and never commit credentials or command output containing secrets.

For each task, the result can show selected files, rejected files and reasons, risks prevented, suggested actions, verified fixes, and remaining human-review items. A suggested fix is an action still awaiting evidence. A verified fix requires a valid command or CI result captured after the relevant edit and matched to the current working-tree hash. A passing earlier test becomes stale after a later edit.

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
- It depends on Windows user permissions and the active OpenCode config directory; file locks, read-only paths, antivirus interference, and network failures remain diagnosable operational failures.

## Customize It

Fork the repository or add a project-level agent when you need a different Harness. Customize the agent prompt, retrieval ranking, command guards, evidence policy, or loop decision logic, then add tests and rebuild the Windows installer. See [Windows plugin architecture](../concepts/windows-plugin-architecture.md) and [customization guidance](../../README.md#customize-your-own-harness).

Project-specific Context Packs can be kept in an explicitly configured local source. Add a primary `DOC.md` or `SKILL.md`, optional version/language metadata, and companion references. Keep Context content separate from policy: if a team rule must block an action, encode and test it in Guard or Policy rather than relying on prose in a pack. Cache, usage, feedback, annotations, and interventions remain under the repository `.agent-context/` runtime boundary.

CLI and MCP documentation is kept for developers and compatibility integrations only.
