# Executor CLI Integration

[中文](executor-cli.zh-CN.md) | English

Use this path when OpenCode++ should drive a bounded harness-led loop while an external coding agent performs edits.

## OpenCode Batch Executor

```bash
npm i -g opencode-ai opencode-plusplus
cd your-repo
opencode-plusplus oc run "fix login timeout bug" .
```

The official OpenCode Desktop plugin is the default transparent chat path. This command is the batch executor path, where OpenCode++ owns the bounded loop and OpenCode performs edits.

Read the full sidecar flow in [OpenCode Transparent Sidecar Mode](opencode-sidecar.md).

## OpenCode Preset

```bash
opencode-plusplus oc init .
opencode-plusplus opencode doctor .
opencode-plusplus opencode run "fix login timeout bug" .
opencode-plusplus oc run "fix login timeout bug" .
opencode-plusplus oc report --last
opencode-plusplus oc repair
```

The preset uses the built-in command template:

```bash
opencode run --format json --dir {repo} "Follow the attached OpenCode++ task prompt." --file {prompt}
```

`opencode-plusplus opencode doctor` checks OpenCode installation, `opencode run`, `opencode auth list`, git repository status, `.agent-context`, and working-tree cleanliness.

`opencode-plusplus oc init` creates OpenCode-native commands and an agent profile aligned with the global `/plusplus-task` and `/plusplus-verify` flow:

```txt
.opencode/commands/plusplus-task.md
.opencode/commands/plusplus-verify.md
.opencode/agents/opencode-plusplus.md
```

Inside OpenCode, use `/plusplus-task <task>` to start a harness task and `/plusplus-verify` before finalizing. The repo-level files mirror the global commands written by the Windows installer, so both entry points share the same tool-based workflow.

OpenCode preset runs print a compact terminal summary by default:

```txt
OpenCode++ OpenCode Run

Task: fix login timeout bug
Decision: repair
Confidence: 0.72

Changed files:
- src/auth/session.ts
- test/auth/session.test.ts

Blocking gates:
- Evidence Guard: no test command after last edit

Next:
  opencode-plusplus oc repair
  opencode-plusplus oc report --last
```

## Generic Command Adapter

```bash
opencode-plusplus orchestrate "fix login timeout bug" . \
  --executor opencode \
  --executor-command "opencode run --format json --dir {repo} \"Follow the attached OpenCode++ task prompt.\" --file {prompt}" \
  --max-loops 3 \
  --checkpoint git-worktree \
  --fail-on required
```

## Recommended Flow

```txt
task
  -> plan / pack
  -> build prompt
  -> run external executor
  -> collect diff / trace / events
  -> hallucination / regression / policy / impact / verify
  -> decision report
```

## Placeholders

- `{prompt}`: path to the per-iteration prompt file supplied by OpenCode++.
- `{task}`: original task text.
- `{repo}`: repository path.
- `{runDir}`: `.agent-context/runs/<task-id>/`.
- `{agent}`: executor-specific agent/profile value.

## Sandbox

`--checkpoint git-worktree` runs the executor in a temporary worktree and exports patches back to the run directory. OpenCode++ records rollback decisions and checkpoint evidence, but it does not destructively reset the user's working tree.
