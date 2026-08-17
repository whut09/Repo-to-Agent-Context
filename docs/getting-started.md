# Getting Started

This guide gets OpenCode++ running in OpenCode chat mode in about five minutes.

## Install

Install OpenCode++ and OpenCode globally:

```bash
npm i -g opencode-plusplus opencode-ai
```

Then enter the repository you want to work on:

```bash
cd your-repo
opencode-plusplus
```

Then chat normally:

```txt
Fix the login timeout bug.
Add tests for this module.
Refactor this function while preserving behavior.
```

## Daily Commands

```bash
opencode-plusplus
opencode-plusplus report
opencode-plusplus status
opencode-plusplus doctor
opencode-plusplus --pure
```

`opencode-plusplus` runs preflight, ensures `.agent-context`, writes `.opencode/plugins/opencode-plusplus.ts`, prepares OpenCode commands/agent files, prints a compact readiness summary, and launches `opencode .`.

The sidecar listens for `tool.execute.before`, `tool.execute.after`, `file.edited`, and `session.idle` events. Before a tool runs, it blocks dangerous commands, hallucinated package scripts / Makefile targets, and protected / secret paths. After a tool runs, it records command evidence under `.agent-context/traces/`, including exit code when available, timestamps, stdout/stderr hashes, sanitized and truncated output previews, working-tree hashes, and touched files. Long stdout/stderr is passed through a JSON evidence file instead of CLI arguments. On idle, it runs dirty/debounced incremental verification.

For the full interactive flow, generated files, and mode comparison, read [OpenCode Transparent Sidecar Mode](integrations/opencode-sidecar.md).

If you already use the official OpenCode Desktop, install the CLI globally and prepare each target repository without launching the TUI:

```bash
opencode-plusplus desktop init .
```

Then reopen the repository in OpenCode Desktop. See the detailed [OpenCode Desktop installation guide](integrations/opencode-desktop.zh-CN.md).

The latest sidecar result is written to:

```txt
.agent-context/sidecar/latest.json
.agent-context/sidecar/latest.md
```

The TUI only receives a sidecar message when blockers are detected.

## TUI Input Methods

OpenCode++ keeps using OpenCode's native TUI. It does not embed the TUI and does not require Desktop. Use one of three input methods:

1. Direct input for short prompts.
2. `/editor` or `Ctrl+X E` for long prompts. On Windows, run `opencode-plusplus setup-editor` once to persist `EDITOR=code --wait`, falling back to `cursor --wait` or `notepad`.
3. `/clip` for pasted long text: run `opencode-plusplus install-commands`, copy text, run `opencode-plusplus clip`, then invoke `/clip` in OpenCode TUI.

More details: [TUI paste guide](tui-paste.md).

## Local Development

Inside this repository:

```bash
npm install
npm run build
node dist/cli/index.js tui . --dry-run
```

## Advanced: Build Repository Context

Use this when you only want generated context files without launching OpenCode:

```bash
opencode-plusplus build .
opencode-plusplus validate .
```

This writes `AGENTS.md` and `.agent-context/`.

## Advanced: Task Run

```bash
opencode-plusplus run "fix login timeout bug" .
```

Read the generated run directory:

```txt
.agent-context/runs/<task-id>/
  plan.md
  pack.md
  edit-boundary.md
  tests.md
  impact.md
  verify.md
  prompt.opencode.md
```

## Advanced: Verify After Edits

```bash
opencode-plusplus tests . --diff --base main
opencode-plusplus impact . --base main
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
```

## Advanced: Batch Harness Mode

Use the OpenCode preset when OpenCode++ should call OpenCode in batch mode and evaluate the result:

```bash
opencode-plusplus oc init .
opencode-plusplus oc run "fix login timeout bug" .
opencode-plusplus oc report --last
opencode-plusplus oc repair
```

`opencode-plusplus oc init .` writes OpenCode-native helpers:

```txt
.opencode/commands/opencode-plusplus.md
.opencode/commands/opencode-plusplus-verify.md
.opencode/agents/opencode-plusplus.md
```

Use `orchestrate --executor-command` when you need a custom executor command.
Start with `--executor mock` when testing CI or demos.

## LLM Summaries

LLM summaries use a local file that must not be committed:

```yaml
# opencode-plusplus.local.yml
llm:
  enabled: true
  baseUrl: "xx"
  apiKey: "xx"
  model: "xx"
```

Then run:

```bash
opencode-plusplus build . --llm
```
