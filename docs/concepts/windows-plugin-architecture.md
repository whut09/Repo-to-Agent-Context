# Windows Plugin Architecture

[中文](windows-plugin-architecture.zh-CN.md) | English

## Product Shape

OpenCode++ has one end-user product: a per-user Windows x64 installer that registers a global OpenCode plugin and a standard `mode: primary` agent file. OpenCode Desktop remains responsible for the UI, model, authentication, session lifecycle, and tool dispatch.

```text
OpenCode Desktop
  -> selected primary agent: opencode-plusplus
  -> OpenCode++ plugin tools and hooks
  -> repository .agent-context artifacts
```

The mode prompt tells the current model when to call `retrieve`, `prepare`, `evaluate`, and `next`. The plugin implements those tools in-process. No second model, CLI child process, or second Desktop shell is required.

## Installer Contract

The EXE writes:

```text
<config>\plugins\opencode-plusplus.js
<config>\agents\opencode-plusplus.md
<config>\opencode-plusplus\state.json
<config>\opencode-plusplus\installation.json
```

The install is atomic at the individual file level and preserves the enabled state when the state file is valid. The installer removes files from earlier command-based releases and can restore an old `app.asar` patch when its marker and original backup are both present. New installs never modify `app.asar`.

## Runtime Flow

1. OpenCode loads the global plugin and discovers the primary agent from `agents/opencode-plusplus.md`.
2. The model uses `retrieve` and `prepare` to receive relevant files, edit boundaries, required commands, and a task ID.
3. OpenCode performs file edits and shell calls through its normal tools.
4. Plugin hooks inspect commands and paths before execution and record sanitized evidence afterward.
5. Idle verification and explicit `evaluate` recompute freshness, guards, policy, regression, and convergence against the current working tree.
6. `next` returns a deterministic action. A blocking action is not completion.

## Evidence And Persistence

The plugin records event identity, session/task identity, timestamps, command results, changed paths, working-tree hashes, and redacted output. State, traces, reports, and sessions use the shared atomic store and Windows-compatible lock behavior. Corrupt JSON is reported as a diagnostic state instead of silently becoming an empty state.

Repository artifacts include `.agent-context/traces/`, `.agent-context/runs/`, `.agent-context/loops/`, `.agent-context/delta/`, and `.agent-context/sidecar/`. They are runtime output and must not enter release packages or commits.

## Hard Boundaries

| Boundary              | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| Not a sandbox         | Another process can still edit files or run commands.                     |
| Not a model           | OpenCode's selected model performs the actual coding work.                |
| Not semantic proof    | A passing command does not prove business correctness.                    |
| Not a host fork       | The installer does not patch renderer code or `app.asar`.                 |
| Not an auto-merge bot | It does not commit, push, merge, or destructively rollback automatically. |

## Extension Points

Forks can customize the primary agent prompt, retrieval ranker, command/path guards, evidence policy, loop convergence, decision arbitration, and Desktop tool handlers. Keep those changes in the plugin/runtime boundary, add tests for the new contract, and document what additional signals are or are not observable.

See [OpenCode Desktop installation](../integrations/opencode-desktop.md), [architecture](architecture.md), and [generated files](../reference/generated-files.md).
