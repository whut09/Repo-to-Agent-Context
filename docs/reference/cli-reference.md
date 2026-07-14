# CLI Reference

<!-- generated-by: opencode-plusplus docs:cli -->
<!-- do-not-edit: run npm run docs:cli -->

## Recommended Commands

`opencode-plusplus` is the user-facing product entrypoint. Use it for daily OpenCode-style interactive coding:

```bash
opencode-plusplus
opencode-plusplus report
opencode-plusplus status
opencode-plusplus doctor
opencode-plusplus --pure
```

The same binary also exposes advanced / kernel commands for scriptable context, verification, and harness workflows:

```bash
opencode-plusplus build .
opencode-plusplus verify --diff .
opencode-plusplus orchestrate "task" .
```

## Command Index

| Command                                   | Description                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `opencode-plusplus tui`                   | Launch OpenCode TUI with the OpenCode++ sidecar plugin.                                                        |
| `opencode-plusplus setup-editor`          | Configure EDITOR for OpenCode TUI /editor input.                                                               |
| `opencode-plusplus clip`                  | Write clipboard or piped text to .opencode-plusplus/clipboard/latest.md.                                       |
| `opencode-plusplus install-commands`      | Install OpenCode slash commands for OpenCode++ helpers.                                                        |
| `opencode-plusplus sidecar`               | Inspect and verify OpenCode++ sidecar integrations.                                                            |
| `opencode-plusplus sidecar verify`        | Verify the OpenCode sidecar plugin and event log readiness.                                                    |
| `opencode-plusplus sidecar check-command` | Preflight-check a command or edit path before OpenCode executes it.                                            |
| `opencode-plusplus sidecar record-tool`   | Record OpenCode tool.execute.after evidence into sidecar event logs and execution traces.                      |
| `opencode-plusplus report`                | Show the latest OpenCode++ sidecar report.                                                                     |
| `opencode-plusplus status`                | Show whether the OpenCode++ OpenCode sidecar is active.                                                        |
| `opencode-plusplus doctor`                | Check OpenCode, auth, git, context, plugin version, and OpenCode++ sidecar readiness.                          |
| `opencode-plusplus opencode`              | OpenCode preset commands.                                                                                      |
| `opencode-plusplus opencode run`          | Run the harness-led OpenCode preset: plan/pack -> opencode run -> trace/policy/verify -> decision.             |
| `opencode-plusplus opencode init`         | Initialize OpenCode commands and agent files for OpenCode++.                                                   |
| `opencode-plusplus opencode doctor`       | Check whether OpenCode, plugin version, and the current repository are ready for the OpenCode preset.          |
| `opencode-plusplus opencode report`       | Show the latest OpenCode orchestrator report without opening .agent-context manually.                          |
| `opencode-plusplus opencode repair`       | Print repair guidance from the latest OpenCode decision.                                                       |
| `opencode-plusplus oc`                    | Shortcut for OpenCode preset commands.                                                                         |
| `opencode-plusplus oc run`                | Alias for `opencode-plusplus opencode run`.                                                                    |
| `opencode-plusplus oc init`               | Initialize OpenCode commands and agent files for OpenCode++.                                                   |
| `opencode-plusplus oc doctor`             | Check whether OpenCode, plugin version, and the current repository are ready for the OpenCode preset.          |
| `opencode-plusplus oc report`             | Show the latest OpenCode orchestrator report without opening .agent-context manually.                          |
| `opencode-plusplus oc repair`             | Print repair guidance from the latest OpenCode decision.                                                       |
| `opencode-plusplus build`                 | Generate AGENTS.md and .agent-context outputs.                                                                 |
| `opencode-plusplus savings`               | Print the token savings report.                                                                                |
| `opencode-plusplus init`                  | Create a starter opencode-plusplus.config.yml.                                                                 |
| `opencode-plusplus graph`                 | Print the generated dependency graph markdown.                                                                 |
| `opencode-plusplus readiness`             | Print the agent readiness score and missing context signals.                                                   |
| `opencode-plusplus validate`              | Validate config, generated JSON, dependency edges, confidence, and token budget.                               |
| `opencode-plusplus freshness`             | Check whether AGENTS.md and .agent-context were generated from the current source, config, and commit.         |
| `opencode-plusplus drift`                 | Detect stale generated context, dependency graph, task pack, and contract drift.                               |
| `opencode-plusplus delta`                 | Show what changed, which context outputs are stale, and what an agent must re-read.                            |
| `opencode-plusplus evolve`                | Refresh the agent context with cache-aware full output rebuild and write .agent-context/delta/latest.\*.       |
| `opencode-plusplus diff`                  | Generate context for files changed since a git base ref.                                                       |
| `opencode-plusplus update`                | Rebuild the context package and report files changed since a git ref.                                          |
| `opencode-plusplus explain`               | Explain a file or module from the generated repository index.                                                  |
| `opencode-plusplus run`                   | Agent-led handoff: write .agent-context/runs/<task-id> without spawning a code-agent executor.                 |
| `opencode-plusplus loop`                  | Decide the next agent-loop step from context freshness, diff, contracts, tests, and impact signals.            |
| `opencode-plusplus plan`                  | Generate a task plan with inspection, risk, and validation guidance.                                           |
| `opencode-plusplus pack`                  | Write a task context pack under .agent-context/tasks/<task-id>.                                                |
| `opencode-plusplus verify`                | Verify changed files against affected modules, tests, and risk signals.                                        |
| `opencode-plusplus task`                  | Generate a task-focused context recommendation.                                                                |
| `opencode-plusplus tests`                 | Select minimal, regression, and full-confidence tests for a file or diff.                                      |
| `opencode-plusplus impact`                | Analyze changed files, dependents, related tests, and required verification.                                   |
| `opencode-plusplus policy`                | Evaluate changed files, trace evidence, contracts, freshness, impact, and guard findings against policy gates. |
| `opencode-plusplus hallucination`         | Detect deterministic OpenCode hallucinations: missing files, symbols, commands, dependencies, and config keys. |
| `opencode-plusplus regression`            | Match structured regression memory and require anti-regression test evidence.                                  |
| `opencode-plusplus validate-contracts`    | Validate changed files against generated OpenCode++ contracts and edit boundaries.                             |
| `opencode-plusplus memory`                | Create and confirm structured regression memory candidates.                                                    |
| `opencode-plusplus memory learn-from-pr`  | Learn from the current PR or diff and write a human-reviewable memory candidate.                               |
| `opencode-plusplus memory add-fix`        | Confirm a reviewed memory candidate into .agent-context/regression/fix-history.json.                           |
| `opencode-plusplus trace`                 | Record and inspect structured agent execution traces.                                                          |
| `opencode-plusplus trace start`           | Create .agent-context/traces/<trace-id>.json for a task.                                                       |
| `opencode-plusplus trace add`             | Append one structured step to an execution trace.                                                              |
| `opencode-plusplus trace run`             | Run a command through the harness and append command evidence to an execution trace.                           |
| `opencode-plusplus trace show`            | Show a structured execution trace.                                                                             |
| `opencode-plusplus rag`                   | RAG integration commands.                                                                                      |
| `opencode-plusplus rag export`            | Print a LightRAG-friendly export summary.                                                                      |
| `opencode-plusplus rag search`            | Search repository context through the unified retrieval protocol.                                              |
| `opencode-plusplus retrieve`              | Search repository context through the unified retrieval protocol.                                              |
| `opencode-plusplus orchestrate`           | Harness-led flow: plan/pack -> executor -> diff/trace evidence -> policy/impact/verify -> final decision.      |
| `opencode-plusplus agent`                 | Harness-led executor commands for external coding agents.                                                      |
| `opencode-plusplus agent run`             | Harness-led alias for one orchestrator pass with a selected coding agent executor.                             |
| `opencode-plusplus benchmark`             | Run the loop behavior benchmark over benchmark fixtures.                                                       |
| `opencode-plusplus benchmark-agent`       | Run the real-agent behavior benchmark across context modes using a selected executor.                          |

## Sidecar Evidence Note

`opencode-plusplus sidecar record-tool` is an internal post-execution evidence recorder used by the OpenCode sidecar `tool.execute.after` hook. The sidecar normally calls it with `--input-json <path>` so long stdout/stderr is not exposed through command-line arguments. It writes `.agent-context/traces/opencode-sidecar-events.jsonl`, `.agent-context/traces/tool-evidence/opencode-tool-*.json`, and `.agent-context/traces/opencode-session-<id>.json` with command, exit code when available, timestamps, stdout/stderr hashes, sanitized/truncated output previews, working-tree hashes, and touched files. Missing exit code is recorded as `unknown`, not success.

## Generated Help

### `opencode-plusplus`

```txt
Usage: opencode-plusplus [options] [command]

OpenCode++: add context, boundaries, evidence, and verification gates to coding
agents.

Options:
  -V, --version                             output the version number
  -h, --help                                display help for command

Commands:
  tui [options] [repo]                      Launch OpenCode TUI with the OpenCode++ sidecar plugin.
  setup-editor                              Configure EDITOR for OpenCode TUI /editor input.
  clip [repo]                               Write clipboard or piped text to .opencode-plusplus/clipboard/latest.md.
  install-commands [repo]                   Install OpenCode slash commands for OpenCode++ helpers.
  sidecar                                   Inspect and verify OpenCode++ sidecar integrations.
  report [options] [repo]                   Show the latest OpenCode++ sidecar report.
  status [options] [repo]                   Show whether the OpenCode++ OpenCode sidecar is active.
  doctor [options] [repo]                   Check OpenCode, auth, git, context, plugin version, and OpenCode++ sidecar readiness.
  opencode                                  OpenCode preset commands.
  oc                                        Shortcut for OpenCode preset commands.
  build [options] [repo]                    Generate AGENTS.md and .agent-context outputs.
  savings [options] [repo]                  Print the token savings report.
  init [repo]                               Create a starter opencode-plusplus.config.yml.
  graph [repo]                              Print the generated dependency graph markdown.
  readiness [repo]                          Print the agent readiness score and missing context signals.
  validate [repo]                           Validate config, generated JSON, dependency edges, confidence, and token budget.
  freshness [options] [repo]                Check whether AGENTS.md and .agent-context were generated from the current source, config, and commit.
  drift [options] [repo]                    Detect stale generated context, dependency graph, task pack, and contract drift.
  delta [options] [repo]                    Show what changed, which context outputs are stale, and what an agent must re-read.
  evolve [options] [repo]                   Refresh the agent context with cache-aware full output rebuild and write .agent-context/delta/latest.*.
  diff [options] [repo]                     Generate context for files changed since a git base ref.
  update [options] [repo]                   Rebuild the context package and report files changed since a git ref.
  explain <path> [repo]                     Explain a file or module from the generated repository index.
  run [options] <args...>                   Agent-led handoff: write .agent-context/runs/<task-id> without spawning a code-agent executor.
  loop [options] <args...>                  Decide the next agent-loop step from context freshness, diff, contracts, tests, and impact signals.
  plan [options] <args...>                  Generate a task plan with inspection, risk, and validation guidance.
  pack [options] <args...>                  Write a task context pack under .agent-context/tasks/<task-id>.
  verify [options] [repo]                   Verify changed files against affected modules, tests, and risk signals.
  task [options] <args...>                  Generate a task-focused context recommendation.
  tests [options] [repo]                    Select minimal, regression, and full-confidence tests for a file or diff.
  impact [options] [repo]                   Analyze changed files, dependents, related tests, and required verification.
  policy [options] [repo]                   Evaluate changed files, trace evidence, contracts, freshness, impact, and guard findings against policy gates.
  hallucination [options] [repo]            Detect deterministic OpenCode hallucinations: missing files, symbols, commands, dependencies, and config keys.
  regression [options] [repo]               Match structured regression memory and require anti-regression test evidence.
  validate-contracts [options] [repo]       Validate changed files against generated OpenCode++ contracts and edit boundaries.
  memory                                    Create and confirm structured regression memory candidates.
  trace                                     Record and inspect structured agent execution traces.
  rag                                       RAG integration commands.
  retrieve [options] <task> [repo]          Search repository context through the unified retrieval protocol.
  orchestrate [options] <args...>           Harness-led flow: plan/pack -> executor -> diff/trace evidence -> policy/impact/verify -> final decision.
  agent                                     Harness-led executor commands for external coding agents.
  benchmark [options] [benchmarkDir]        Run the loop behavior benchmark over benchmark fixtures.
  benchmark-agent [options] [benchmarkDir]  Run the real-agent behavior benchmark across context modes using a selected executor.
  help [command]                            display help for command
```

### `opencode-plusplus tui`

```txt
Usage: opencode-plusplus tui [options] [repo]

Launch OpenCode TUI with the OpenCode++ sidecar plugin.

Arguments:
  repo            repository path (default: ".")

Options:
  --force-plugin  overwrite .opencode/plugins/opencode-plusplus.ts
  --skip-context  do not generate .agent-context before launching OpenCode
  --pure          launch plain OpenCode without OpenCode++ context or sidecar
  --dry-run       run preflight and show what would launch without opening
                  OpenCode
  --json          print machine-readable launcher report
  -h, --help      display help for command
```

### `opencode-plusplus setup-editor`

```txt
Usage: opencode-plusplus setup-editor [options]

Configure EDITOR for OpenCode TUI /editor input.

Options:
  -h, --help  display help for command
```

### `opencode-plusplus clip`

```txt
Usage: opencode-plusplus clip [options] [repo]

Write clipboard or piped text to .opencode-plusplus/clipboard/latest.md.

Arguments:
  repo        repository path (default: ".")

Options:
  -h, --help  display help for command
```

### `opencode-plusplus install-commands`

```txt
Usage: opencode-plusplus install-commands [options] [repo]

Install OpenCode slash commands for OpenCode++ helpers.

Arguments:
  repo        repository path (default: ".")

Options:
  -h, --help  display help for command
```

### `opencode-plusplus sidecar`

```txt
Usage: opencode-plusplus sidecar [options] [command]

Inspect and verify OpenCode++ sidecar integrations.

Options:
  -h, --help                      display help for command

Commands:
  verify [options] [repo]         Verify the OpenCode sidecar plugin and event
                                  log readiness.
  check-command [options] [repo]  Preflight-check a command or edit path before
                                  OpenCode executes it.
  record-tool [options] [repo]    Record OpenCode tool.execute.after evidence
                                  into sidecar event logs and execution traces.
  help [command]                  display help for command
```

### `opencode-plusplus sidecar verify`

```txt
Usage: opencode-plusplus sidecar verify [options] [repo]

Verify the OpenCode sidecar plugin and event log readiness.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print machine-readable sidecar verification report
  --quiet     write latest artifacts and only print when blocked
  -h, --help  display help for command
```

### `opencode-plusplus sidecar check-command`

```txt
Usage: opencode-plusplus sidecar check-command [options] [repo]

Preflight-check a command or edit path before OpenCode executes it.

Arguments:
  repo                 repository path (default: ".")

Options:
  --command <command>  command the coding agent is about to execute
  --path <path...>     path(s) the coding agent is about to edit or touch
  --json               print machine-readable command guard result
  -h, --help           display help for command
```

### `opencode-plusplus sidecar record-tool`

```txt
Usage: opencode-plusplus sidecar record-tool [options] [repo]

Record OpenCode tool.execute.after evidence into sidecar event logs and
execution traces.

Arguments:
  repo                                 repository path (default: ".")

Options:
  --tool <tool>                        OpenCode tool name that just executed
  --command <command>                  command executed by the tool
  --exit-code <code>                   tool or command exit code
  --started-at <iso>                   tool start timestamp
  --finished-at <iso>                  tool finish timestamp
  --stdout <text>                      captured stdout text
  --stderr <text>                      captured stderr text
  --stdout-hash <sha256>               stdout content hash
  --stderr-hash <sha256>               stderr content hash
  --stdout-preview <text>              sanitized stdout preview
  --stderr-preview <text>              sanitized stderr preview
  --stdout-truncated                   stdout preview was truncated
  --stderr-truncated                   stderr preview was truncated
  --stdout-redacted                    stdout preview was redacted
  --stderr-redacted                    stderr preview was redacted
  --working-tree-hash-before <sha256>  working tree hash before tool execution
  --working-tree-hash-after <sha256>   working tree hash after tool execution
  --session-id <id>                    OpenCode session id
  --path <path...>                     path(s) touched by the tool
  --input-json <path>                  JSON evidence payload path produced by
                                       the OpenCode++ sidecar plugin
  --json                               print machine-readable tool record result
  -h, --help                           display help for command
```

### `opencode-plusplus report`

```txt
Usage: opencode-plusplus report [options] [repo]

Show the latest OpenCode++ sidecar report.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print report metadata and markdown content as JSON
  -h, --help  display help for command
```

### `opencode-plusplus status`

```txt
Usage: opencode-plusplus status [options] [repo]

Show whether the OpenCode++ OpenCode sidecar is active.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print machine-readable status
  -h, --help  display help for command
```

### `opencode-plusplus doctor`

```txt
Usage: opencode-plusplus doctor [options] [repo]

Check OpenCode, auth, git, context, plugin version, and OpenCode++ sidecar
readiness.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print machine-readable doctor report
  -h, --help  display help for command
```

### `opencode-plusplus opencode`

```txt
Usage: opencode-plusplus opencode [options] [command]

OpenCode preset commands.

Options:
  -h, --help               display help for command

Commands:
  run [options] <args...>  Run the harness-led OpenCode preset: plan/pack ->
                           opencode run -> trace/policy/verify -> decision.
  init [options] [repo]    Initialize OpenCode commands and agent files for
                           OpenCode++.
  doctor [options] [repo]  Check whether OpenCode, plugin version, and the
                           current repository are ready for the OpenCode preset.
  report [options] [repo]  Show the latest OpenCode orchestrator report without
                           opening .agent-context manually.
  repair [options] [repo]  Print repair guidance from the latest OpenCode
                           decision.
  help [command]           display help for command
```

### `opencode-plusplus opencode run`

```txt
Usage: opencode-plusplus opencode run [options] <args...>

Run the harness-led OpenCode preset: plan/pack -> opencode run ->
trace/policy/verify -> decision.

Arguments:
  args                             task description and optional repository path

Options:
  --repo <repo...>                 repository path; accepts multiple words when
                                   the path contains spaces or non-ASCII
                                   characters
  --executor-command <command>     OpenCode command template; supports {prompt},
                                   {task}, {repo}, {runDir}, {agent} (default:
                                   "opencode run --format json --dir {repo}
                                   \"Follow the attached OpenCode++ task
                                   prompt.\" --file {prompt}")
  --opencode-transcript <path>     optional OpenCode session transcript file to
                                   normalize into the execution trace
  --agent <agent>                  OpenCode agent/profile name
  --max-loops <count>              maximum orchestrator iterations before
                                   requiring human review (default: 3)
  --type <type>                    task type: auto, bugfix, feature, refactor
                                   (default: "auto")
  -b, --token-budget <tokens>      task context token budget
  --base <ref>                     base git ref for diff, policy, tests, impact,
                                   and verify (default: "main")
  --fail-on <level>                policy failure threshold: forbidden,
                                   required, risk (default: "required")
  --evidence-policy <mode>         evidence policy: advisory, balanced, strict
  --checkpoint <mode>              checkpoint mode: none, git-worktree (default:
                                   "git-worktree")
  --dry-run                        exercise the harness using the mock executor
                                   without editing files
  --stream-executor                stream executor stdout/stderr while the
                                   harness is running
  --executor-timeout-ms <ms>       maximum executor runtime before the harness
                                   stops it
  --executor-idle-timeout-ms <ms>  maximum executor silence before the harness
                                   stops it
  --full-report                    print the full orchestrator report instead of
                                   the compact OpenCode summary
  --json                           print machine-readable orchestrator report
  -h, --help                       display help for command
```

### `opencode-plusplus opencode init`

```txt
Usage: opencode-plusplus opencode init [options] [repo]

Initialize OpenCode commands and agent files for OpenCode++.

Arguments:
  repo        repository path (default: ".")

Options:
  --force     overwrite existing OpenCode command and agent files
  --dry-run   show which OpenCode files would be written without changing files
  --json      print machine-readable init report
  -h, --help  display help for command
```

### `opencode-plusplus opencode doctor`

```txt
Usage: opencode-plusplus opencode doctor [options] [repo]

Check whether OpenCode, plugin version, and the current repository are ready for
the OpenCode preset.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print machine-readable doctor report
  -h, --help  display help for command
```

### `opencode-plusplus opencode report`

```txt
Usage: opencode-plusplus opencode report [options] [repo]

Show the latest OpenCode orchestrator report without opening .agent-context
manually.

Arguments:
  repo            repository path (default: ".")

Options:
  --last          show the most recent OpenCode orchestrator report (default:
                  true)
  --task-id <id>  show a specific task id
  --summary       print the compact OpenCode summary instead of the full report
  --json          print machine-readable orchestrator report
  -h, --help      display help for command
```

### `opencode-plusplus opencode repair`

```txt
Usage: opencode-plusplus opencode repair [options] [repo]

Print repair guidance from the latest OpenCode decision.

Arguments:
  repo            repository path (default: ".")

Options:
  --last          use the most recent OpenCode orchestrator report (default:
                  true)
  --task-id <id>  use a specific task id
  -h, --help      display help for command
```

### `opencode-plusplus oc`

```txt
Usage: opencode-plusplus oc [options] [command]

Shortcut for OpenCode preset commands.

Options:
  -h, --help               display help for command

Commands:
  run [options] <args...>  Alias for `opencode-plusplus opencode run`.
  init [options] [repo]    Initialize OpenCode commands and agent files for
                           OpenCode++.
  doctor [options] [repo]  Check whether OpenCode, plugin version, and the
                           current repository are ready for the OpenCode preset.
  report [options] [repo]  Show the latest OpenCode orchestrator report without
                           opening .agent-context manually.
  repair [options] [repo]  Print repair guidance from the latest OpenCode
                           decision.
  help [command]           display help for command
```

### `opencode-plusplus oc run`

```txt
Usage: opencode-plusplus oc run [options] <args...>

Alias for `opencode-plusplus opencode run`.

Arguments:
  args                             task description and optional repository path

Options:
  --repo <repo...>                 repository path; accepts multiple words when
                                   the path contains spaces or non-ASCII
                                   characters
  --executor-command <command>     OpenCode command template; supports {prompt},
                                   {task}, {repo}, {runDir}, {agent} (default:
                                   "opencode run --format json --dir {repo}
                                   \"Follow the attached OpenCode++ task
                                   prompt.\" --file {prompt}")
  --opencode-transcript <path>     optional OpenCode session transcript file to
                                   normalize into the execution trace
  --agent <agent>                  OpenCode agent/profile name
  --max-loops <count>              maximum orchestrator iterations before
                                   requiring human review (default: 3)
  --type <type>                    task type: auto, bugfix, feature, refactor
                                   (default: "auto")
  -b, --token-budget <tokens>      task context token budget
  --base <ref>                     base git ref for diff, policy, tests, impact,
                                   and verify (default: "main")
  --fail-on <level>                policy failure threshold: forbidden,
                                   required, risk (default: "required")
  --evidence-policy <mode>         evidence policy: advisory, balanced, strict
  --checkpoint <mode>              checkpoint mode: none, git-worktree (default:
                                   "git-worktree")
  --dry-run                        exercise the harness using the mock executor
                                   without editing files
  --stream-executor                stream executor stdout/stderr while the
                                   harness is running
  --executor-timeout-ms <ms>       maximum executor runtime before the harness
                                   stops it
  --executor-idle-timeout-ms <ms>  maximum executor silence before the harness
                                   stops it
  --full-report                    print the full orchestrator report instead of
                                   the compact OpenCode summary
  --json                           print machine-readable orchestrator report
  -h, --help                       display help for command
```

### `opencode-plusplus oc init`

```txt
Usage: opencode-plusplus oc init [options] [repo]

Initialize OpenCode commands and agent files for OpenCode++.

Arguments:
  repo        repository path (default: ".")

Options:
  --force     overwrite existing OpenCode command and agent files
  --dry-run   show which OpenCode files would be written without changing files
  --json      print machine-readable init report
  -h, --help  display help for command
```

### `opencode-plusplus oc doctor`

```txt
Usage: opencode-plusplus oc doctor [options] [repo]

Check whether OpenCode, plugin version, and the current repository are ready for
the OpenCode preset.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print machine-readable doctor report
  -h, --help  display help for command
```

### `opencode-plusplus oc report`

```txt
Usage: opencode-plusplus oc report [options] [repo]

Show the latest OpenCode orchestrator report without opening .agent-context
manually.

Arguments:
  repo            repository path (default: ".")

Options:
  --last          show the most recent OpenCode orchestrator report (default:
                  true)
  --task-id <id>  show a specific task id
  --summary       print the compact OpenCode summary instead of the full report
  --json          print machine-readable orchestrator report
  -h, --help      display help for command
```

### `opencode-plusplus oc repair`

```txt
Usage: opencode-plusplus oc repair [options] [repo]

Print repair guidance from the latest OpenCode decision.

Arguments:
  repo            repository path (default: ".")

Options:
  --last          use the most recent OpenCode orchestrator report (default:
                  true)
  --task-id <id>  use a specific task id
  -h, --help      display help for command
```

### `opencode-plusplus build`

```txt
Usage: opencode-plusplus build [options] [repo]

Generate AGENTS.md and .agent-context outputs.

Arguments:
  repo                         repository path (default: ".")

Options:
  -t, --target <target>        agent target: opencode, codex, claude, cursor,
                               all
  -b, --token-budget <tokens>  target token budget
  --tokenizer <tokenizer>      tokenizer: chars-approx, cl100k_base, o200k_base
  --model <model>              model name used to infer tokenizer, for example
                               gpt-4.1
  --llm                        enable LLM summaries using
                               opencode-plusplus.local.yml
  --no-llm                     disable LLM summaries
  -h, --help                   display help for command
```

### `opencode-plusplus savings`

```txt
Usage: opencode-plusplus savings [options] [repo]

Print the token savings report.

Arguments:
  repo                         repository path (default: ".")

Options:
  -b, --token-budget <tokens>  target token budget
  --actual                     write the context package first and report actual
                               generated output tokens
  --tokenizer <tokenizer>      tokenizer: chars-approx, cl100k_base, o200k_base
  --model <model>              model name used to infer tokenizer, for example
                               gpt-4.1
  -h, --help                   display help for command
```

### `opencode-plusplus init`

```txt
Usage: opencode-plusplus init [options] [repo]

Create a starter opencode-plusplus.config.yml.

Arguments:
  repo        repository path (default: ".")

Options:
  -h, --help  display help for command
```

### `opencode-plusplus graph`

```txt
Usage: opencode-plusplus graph [options] [repo]

Print the generated dependency graph markdown.

Arguments:
  repo        repository path (default: ".")

Options:
  -h, --help  display help for command
```

### `opencode-plusplus readiness`

```txt
Usage: opencode-plusplus readiness [options] [repo]

Print the agent readiness score and missing context signals.

Arguments:
  repo        repository path (default: ".")

Options:
  -h, --help  display help for command
```

### `opencode-plusplus validate`

```txt
Usage: opencode-plusplus validate [options] [repo]

Validate config, generated JSON, dependency edges, confidence, and token budget.

Arguments:
  repo        repository path (default: ".")

Options:
  -h, --help  display help for command
```

### `opencode-plusplus freshness`

```txt
Usage: opencode-plusplus freshness [options] [repo]

Check whether AGENTS.md and .agent-context were generated from the current
source, config, and commit.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print machine-readable freshness report
  -h, --help  display help for command
```

### `opencode-plusplus drift`

```txt
Usage: opencode-plusplus drift [options] [repo]

Detect stale generated context, dependency graph, task pack, and contract drift.

Arguments:
  repo        repository path (default: ".")

Options:
  --json      print machine-readable drift report
  -h, --help  display help for command
```

### `opencode-plusplus delta`

```txt
Usage: opencode-plusplus delta [options] [repo]

Show what changed, which context outputs are stale, and what an agent must
re-read.

Arguments:
  repo          repository path (default: ".")

Options:
  --base <ref>  base git ref for context delta analysis (default: "main")
  --json        print machine-readable context delta
  -h, --help    display help for command
```

### `opencode-plusplus evolve`

```txt
Usage: opencode-plusplus evolve [options] [repo]

Refresh the agent context with cache-aware full output rebuild and write
.agent-context/delta/latest.*.

Arguments:
  repo          repository path (default: ".")

Options:
  --base <ref>  base git ref for context delta analysis (default: "main")
  --json        print machine-readable evolve report after updating context
  -h, --help    display help for command
```

### `opencode-plusplus diff`

```txt
Usage: opencode-plusplus diff [options] [repo]

Generate context for files changed since a git base ref.

Arguments:
  repo          repository path (default: ".")

Options:
  --base <ref>  base git ref (default: "main")
  -h, --help    display help for command
```

### `opencode-plusplus update`

```txt
Usage: opencode-plusplus update [options] [repo]

Rebuild the context package and report files changed since a git ref.

Arguments:
  repo           repository path (default: ".")

Options:
  --since <ref>  show changed files since a git ref after rebuilding (default:
                 "main")
  -h, --help     display help for command
```

### `opencode-plusplus explain`

```txt
Usage: opencode-plusplus explain [options] <path> [repo]

Explain a file or module from the generated repository index.

Arguments:
  path        file path or module name to explain
  repo        repository path (default: ".")

Options:
  -h, --help  display help for command
```

### `opencode-plusplus run`

```txt
Usage: opencode-plusplus run [options] <args...>

Agent-led handoff: write .agent-context/runs/<task-id> without spawning a
code-agent executor.

Arguments:
  args                         task description and optional repository path

Options:
  --repo <repo...>             repository path; accepts multiple words when the
                               path contains spaces or non-ASCII characters
  --type <type>                task type: auto, bugfix, feature, refactor
                               (default: "auto")
  -b, --token-budget <tokens>  task run context token budget
  --base <ref>                 base git ref for impact and verification reports
                               (default: "main")
  -h, --help                   display help for command
```

### `opencode-plusplus loop`

```txt
Usage: opencode-plusplus loop [options] <args...>

Decide the next agent-loop step from context freshness, diff, contracts, tests,
and impact signals.

Arguments:
  args                         task description and optional repository path

Options:
  --repo <repo...>             repository path; accepts multiple words when the
                               path contains spaces or non-ASCII characters
  --phase <phase>              loop phase: preflight, after-edit, repair
                               (default: "after-edit")
  --type <type>                task type: auto, bugfix, feature, refactor
                               (default: "auto")
  -b, --token-budget <tokens>  task context token budget
  --base <ref>                 base git ref for diff, tests, impact, and
                               contract checks (default: "main")
  --trace <id>                 execution trace id used as loop evidence
  --evidence-policy <mode>     evidence policy: advisory, balanced, strict
  --write                      write loop.md and loop.json under
                               .agent-context/loops/<task-id>
  --json                       print machine-readable loop controller report
  -h, --help                   display help for command
```

### `opencode-plusplus plan`

```txt
Usage: opencode-plusplus plan [options] <args...>

Generate a task plan with inspection, risk, and validation guidance.

Arguments:
  args                         task description and optional repository path

Options:
  --repo <repo...>             repository path; accepts multiple words when the
                               path contains spaces or non-ASCII characters
  --type <type>                task type: auto, bugfix, feature, refactor
                               (default: "auto")
  -b, --token-budget <tokens>  task planning token budget
  -h, --help                   display help for command
```

### `opencode-plusplus pack`

```txt
Usage: opencode-plusplus pack [options] <args...>

Write a task context pack under .agent-context/tasks/<task-id>.

Arguments:
  args                         task description and optional repository path

Options:
  --repo <repo...>             repository path; accepts multiple words when the
                               path contains spaces or non-ASCII characters
  --type <type>                task type: auto, bugfix, feature, refactor
                               (default: "auto")
  -b, --token-budget <tokens>  task context token budget
  -h, --help                   display help for command
```

### `opencode-plusplus verify`

```txt
Usage: opencode-plusplus verify [options] [repo]

Verify changed files against affected modules, tests, and risk signals.

Arguments:
  repo          repository path (default: ".")

Options:
  --diff        verify changed files from git diff and working tree (default:
                true)
  --base <ref>  base git ref (default: "main")
  --trace <id>  execution trace id used as regression test evidence
  -h, --help    display help for command
```

### `opencode-plusplus task`

```txt
Usage: opencode-plusplus task [options] <args...>

Generate a task-focused context recommendation.

Arguments:
  args                         task description and optional repository path

Options:
  --repo <repo...>             repository path; accepts multiple words when the
                               path contains spaces or non-ASCII characters
  --type <type>                task type: auto, bugfix, feature, refactor
                               (default: "auto")
  -b, --token-budget <tokens>  task context token budget
  -h, --help                   display help for command
```

### `opencode-plusplus tests`

```txt
Usage: opencode-plusplus tests [options] [repo]

Select minimal, regression, and full-confidence tests for a file or diff.

Arguments:
  repo                 repository path (default: ".")

Options:
  --for <path...>      select tests for one or more changed source files
  --diff               select tests for files changed from the base ref
  --base <ref>         base git ref for --diff (default: "main")
  --backend <backend>  code intelligence backend: internal, codegraph (default:
                       "internal")
  -h, --help           display help for command
```

### `opencode-plusplus impact`

```txt
Usage: opencode-plusplus impact [options] [repo]

Analyze changed files, dependents, related tests, and required verification.

Arguments:
  repo                 repository path (default: ".")

Options:
  --base <ref>         base git ref (default: "main")
  --backend <backend>  code intelligence backend: internal, codegraph (default:
                       "internal")
  -h, --help           display help for command
```

### `opencode-plusplus policy`

```txt
Usage: opencode-plusplus policy [options] [repo]

Evaluate changed files, trace evidence, contracts, freshness, impact, and guard
findings against policy gates.

Arguments:
  repo                      repository path (default: ".")

Options:
  --base <ref>              base git ref for diff checks (default: "main")
  --trace <id>              execution trace id used as verification evidence
  --evidence-policy <mode>  evidence policy: advisory, balanced, strict
  --fail-on <level>         policy failure threshold: forbidden, required, risk
                            (default: "required")
  --json                    print machine-readable policy report
  -h, --help                display help for command
```

### `opencode-plusplus hallucination`

```txt
Usage: opencode-plusplus hallucination [options] [repo]

Detect deterministic OpenCode hallucinations: missing files, symbols, commands,
dependencies, and config keys.

Arguments:
  repo           repository path (default: ".")

Options:
  --base <ref>   base git ref for diff checks (default: "main")
  --trace <id>   execution trace id used as transcript evidence
  --task <task>  task text used to derive the task id when no trace id is
                 provided
  --no-write     print the report without writing .agent-context hallucination
                 artifacts
  --json         print machine-readable hallucination report
  -h, --help     display help for command
```

### `opencode-plusplus regression`

```txt
Usage: opencode-plusplus regression [options] [repo]

Match structured regression memory and require anti-regression test evidence.

Arguments:
  repo           repository path (default: ".")

Options:
  --base <ref>   base git ref for diff checks (default: "main")
  --trace <id>   execution trace id used as regression test evidence
  --task <task>  task text used to match known issues and derive task id
  --no-write     print the report without writing .agent-context regression
                 artifacts
  --json         print machine-readable regression report
  -h, --help     display help for command
```

### `opencode-plusplus validate-contracts`

```txt
Usage: opencode-plusplus validate-contracts [options] [repo]

Validate changed files against generated OpenCode++ contracts and edit
boundaries.

Arguments:
  repo          repository path (default: ".")

Options:
  --diff        validate changed files from git diff and working tree (default:
                true)
  --base <ref>  base git ref (default: "main")
  -h, --help    display help for command
```

### `opencode-plusplus memory`

```txt
Usage: opencode-plusplus memory [options] [command]

Create and confirm structured regression memory candidates.

Options:
  -h, --help                      display help for command

Commands:
  learn-from-pr [options] [repo]  Learn from the current PR or diff and write a
                                  human-reviewable memory candidate.
  add-fix [options] [repo]        Confirm a reviewed memory candidate into
                                  .agent-context/regression/fix-history.json.
  help [command]                  display help for command
```

### `opencode-plusplus memory learn-from-pr`

```txt
Usage: opencode-plusplus memory learn-from-pr [options] [repo]

Learn from the current PR or diff and write a human-reviewable memory candidate.

Arguments:
  repo                         repository path (default: ".")

Options:
  --base <ref>                 base git ref used to infer changed files
                               (default: "main")
  --task <task>                task or PR summary used as the candidate bug
                               pattern
  --bug-pattern <text>         explicit bug pattern to store in the candidate
  --changed-files <files>      comma-separated changed files to store in the
                               candidate
  --required-tests <commands>  comma-separated required regression test commands
  --risk-triggers <terms>      comma-separated trigger terms for future matching
  --json                       print machine-readable candidate output
  -h, --help                   display help for command
```

### `opencode-plusplus memory add-fix`

```txt
Usage: opencode-plusplus memory add-fix [options] [repo]

Confirm a reviewed memory candidate into
.agent-context/regression/fix-history.json.

Arguments:
  repo                repository path (default: ".")

Options:
  --candidate <path>  candidate JSON path; defaults to the latest
                      .agent-context/memory/candidates/*.json
  --json              print machine-readable memory entry output
  -h, --help          display help for command
```

### `opencode-plusplus trace`

```txt
Usage: opencode-plusplus trace [options] [command]

Record and inspect structured agent execution traces.

Options:
  -h, --help                       display help for command

Commands:
  start [options] <args...>        Create .agent-context/traces/<trace-id>.json
                                   for a task.
  add [options] <traceId> [repo]   Append one structured step to an execution
                                   trace.
  run [options] <traceId> [repo]   Run a command through the harness and append
                                   command evidence to an execution trace.
  show [options] <traceId> [repo]  Show a structured execution trace.
  help [command]                   display help for command
```

### `opencode-plusplus trace start`

```txt
Usage: opencode-plusplus trace start [options] <args...>

Create .agent-context/traces/<trace-id>.json for a task.

Arguments:
  args              task description and optional repository path

Options:
  --repo <repo...>  repository path; accepts multiple words when the path
                    contains spaces or non-ASCII characters
  --agent <agent>   agent name, for example codex, claude, cursor
  --id <id>         trace id; defaults to a task slug
  --json            print machine-readable execution trace
  -h, --help        display help for command
```

### `opencode-plusplus trace add`

```txt
Usage: opencode-plusplus trace add [options] <traceId> [repo]

Append one structured step to an execution trace.

Arguments:
  traceId                              trace id
  repo                                 repository path (default: ".")

Options:
  --action <action>                    step action, for example edit, run-test,
                                       verify, repair
  --agent <agent>                      agent name
  --files <files>                      comma-separated files touched by this
                                       step
  --reason <reason>                    why the step was taken
  --command <command>                  command that was run
  --test <test>                        test file or test target
  --result <result>                    result: passed, failed, skipped, unknown
  --output <output>                    short command output or observation
  --evidence-source <source>           evidence source: manual, command, ci
                                       (default: "manual")
  --exit-code <code>                   command or CI exit code
  --started-at <iso>                   command or CI start timestamp
  --finished-at <iso>                  command or CI finish timestamp
  --stdout-hash <sha256>               stdout content hash
  --stderr-hash <sha256>               stderr content hash
  --working-tree-hash-before <sha256>  working tree hash before command
  --working-tree-hash-after <sha256>   working tree hash after command
  --final-state <state>                final state: planned, in_progress,
                                       partial_success, success, failed, blocked
  --json                               print machine-readable execution trace
  -h, --help                           display help for command
```

### `opencode-plusplus trace run`

```txt
Usage: opencode-plusplus trace run [options] <traceId> [repo]

Run a command through the harness and append command evidence to an execution
trace.

Arguments:
  traceId                trace id
  repo                   repository path (default: ".")

Options:
  --command <command>    command to execute and record as harness-captured
                         evidence
  --action <action>      step action, for example run-test, verify,
                         validate-contracts (default: "run-test")
  --agent <agent>        agent name
  --files <files>        comma-separated files touched or verified by this
                         command
  --reason <reason>      why the command was run
  --test <test>          test file or test target
  --final-state <state>  final state: planned, in_progress, partial_success,
                         success, failed, blocked
  --json                 print machine-readable execution trace plus command
                         output
  -h, --help             display help for command
```

### `opencode-plusplus trace show`

```txt
Usage: opencode-plusplus trace show [options] <traceId> [repo]

Show a structured execution trace.

Arguments:
  traceId     trace id
  repo        repository path (default: ".")

Options:
  --json      print machine-readable execution trace
  -h, --help  display help for command
```

### `opencode-plusplus rag`

```txt
Usage: opencode-plusplus rag [options] [command]

RAG integration commands.

Options:
  -h, --help                      display help for command

Commands:
  export [options] [repo]         Print a LightRAG-friendly export summary.
  search [options] <task> [repo]  Search repository context through the unified
                                  retrieval protocol.
  help [command]                  display help for command
```

### `opencode-plusplus rag export`

```txt
Usage: opencode-plusplus rag export [options] [repo]

Print a LightRAG-friendly export summary.

Arguments:
  repo                         repository path (default: ".")

Options:
  -b, --token-budget <tokens>  target token budget
  -h, --help                   display help for command
```

### `opencode-plusplus rag search`

```txt
Usage: opencode-plusplus rag search [options] <task> [repo]

Search repository context through the unified retrieval protocol.

Arguments:
  task                     task or search query
  repo                     repository path (default: ".")

Options:
  --provider <provider>    retriever provider: static, ripgrep, hybrid,
                           lightrag, embedding, codegraph (default: "hybrid")
  -k, --top-k <count>      number of context hits (default: 8)
  --modules <modules>      comma-separated module filter
  --changed-files <files>  comma-separated changed file filter
  --include-tests          include test files in retrieval results
  --json                   print machine-readable context hits
  -h, --help               display help for command
```

### `opencode-plusplus retrieve`

```txt
Usage: opencode-plusplus retrieve [options] <task> [repo]

Search repository context through the unified retrieval protocol.

Arguments:
  task                     task or search query
  repo                     repository path (default: ".")

Options:
  --provider <provider>    retriever provider: static, ripgrep, hybrid,
                           lightrag, embedding, codegraph (default: "hybrid")
  -k, --top-k <count>      number of context hits (default: 8)
  --modules <modules>      comma-separated module filter
  --changed-files <files>  comma-separated changed file filter
  --include-tests          include test files in retrieval results
  --json                   print machine-readable context hits
  -h, --help               display help for command
```

### `opencode-plusplus orchestrate`

```txt
Usage: opencode-plusplus orchestrate [options] <args...>

Harness-led flow: plan/pack -> executor -> diff/trace evidence ->
policy/impact/verify -> final decision.

Arguments:
  args                          task description and optional repository path

Options:
  --repo <repo...>              repository path; accepts multiple words when the
                                path contains spaces or non-ASCII characters
  --executor <executor>         executor: codex, claude-code, opencode,
                                mimocode, cursor, mock (default: "mock")
  --executor-command <command>  argv-style command used to run the selected
                                executor; supports {prompt}, {task}, {repo},
                                {runDir}, {agent}
  --opencode-transcript <path>  optional OpenCode session transcript file to
                                normalize into the execution trace
  --agent <agent>               executor-specific agent/profile name
  --max-loops <count>           maximum orchestrator iterations before requiring
                                human review (default: 1)
  --type <type>                 task type: auto, bugfix, feature, refactor
                                (default: "auto")
  -b, --token-budget <tokens>   task context token budget
  --base <ref>                  base git ref for diff, policy, tests, impact,
                                and verify (default: "main")
  --fail-on <level>             policy failure threshold: forbidden, required,
                                risk (default: "required")
  --evidence-policy <mode>      evidence policy: advisory, balanced, strict
  --checkpoint <mode>           checkpoint mode: none, git-worktree (default:
                                "none")
  --dry-run                     exercise the harness using the mock executor
                                without editing files
  --json                        print machine-readable orchestrator report
  -h, --help                    display help for command
```

### `opencode-plusplus agent`

```txt
Usage: opencode-plusplus agent [options] [command]

Harness-led executor commands for external coding agents.

Options:
  -h, --help               display help for command

Commands:
  run [options] <args...>  Harness-led alias for one orchestrator pass with a
                           selected coding agent executor.
  help [command]           display help for command
```

### `opencode-plusplus agent run`

```txt
Usage: opencode-plusplus agent run [options] <args...>

Harness-led alias for one orchestrator pass with a selected coding agent
executor.

Arguments:
  args                          task description and optional repository path

Options:
  --repo <repo...>              repository path; accepts multiple words when the
                                path contains spaces or non-ASCII characters
  --executor <executor>         executor: codex, claude-code, opencode,
                                mimocode, cursor, mock (default: "mock")
  --executor-command <command>  argv-style command used to run the selected
                                executor; supports {prompt}, {task}, {repo},
                                {runDir}, {agent}
  --opencode-transcript <path>  optional OpenCode session transcript file to
                                normalize into the execution trace
  --agent <agent>               executor-specific agent/profile name
  --type <type>                 task type: auto, bugfix, feature, refactor
                                (default: "auto")
  -b, --token-budget <tokens>   task context token budget
  --base <ref>                  base git ref for diff, policy, tests, impact,
                                and verify (default: "main")
  --fail-on <level>             policy failure threshold: forbidden, required,
                                risk (default: "required")
  --evidence-policy <mode>      evidence policy: advisory, balanced, strict
  --checkpoint <mode>           checkpoint mode: none, git-worktree (default:
                                "none")
  --dry-run                     exercise the harness using the mock executor
                                without editing files
  --json                        print machine-readable orchestrator report
  -h, --help                    display help for command
```

### `opencode-plusplus benchmark`

```txt
Usage: opencode-plusplus benchmark [options] [benchmarkDir]

Run the loop behavior benchmark over benchmark fixtures.

Arguments:
  benchmarkDir         benchmark directory (default: "benchmarks")

Options:
  -k, --top-k <count>  top-K files used for recall/precision (default: 8)
  --json               print machine-readable benchmark results
  -h, --help           display help for command
```

### `opencode-plusplus benchmark-agent`

```txt
Usage: opencode-plusplus benchmark-agent [options] [benchmarkDir]

Run the real-agent behavior benchmark across context modes using a selected
executor.

Arguments:
  benchmarkDir                  benchmark directory (default: "benchmarks")

Options:
  --executor <executor>         executor: codex, claude-code, opencode,
                                mimocode, cursor, mock (default: "mock")
  --executor-command <command>  argv-style command; supports {prompt}, {task},
                                {repo}, {runDir}, {agent}
  --agent <agent>               executor-specific agent/profile name
  --max-loops <count>           maximum loop count for harness-led mode
                                (default: 3)
  --fail-on <level>             policy failure threshold: forbidden, required,
                                risk (default: "required")
  --base <ref>                  base git ref created in each fixture workspace
                                (default: "main")
  --modes <modes>               comma-separated modes: no-context, agents-md,
                                context-pack, loop-enabled-harness
  --task <ids>                  comma-separated task ids to run
  --dry-run                     exercise executor paths without editing files
  --keep-workdirs               keep temporary fixture workdirs for inspection
  --json                        print machine-readable agent behavior benchmark
                                results
  -h, --help                    display help for command
```
