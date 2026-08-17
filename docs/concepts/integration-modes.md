# Integration Modes and Entry Isolation

[中文](integration-modes.zh-CN.md) | English

OpenCode++ supports two separate flows. The difference is not whether AI is used; the difference is where the control boundary sits.

In both flows, Guard modules provide the reliability layer:

- Context Guard prepares task-specific context.
- Hallucination Guard checks deterministic missing files, commands, symbols, dependencies, and config keys.
- Boundary Guard defines and checks the edit surface.
- Evidence Guard validates command and test evidence.
- Impact Guard explains blast radius and review risk.
- Loop Guard decides whether to finalize, repair, repack, block, or require human review.

The difference is whether those Guards are advisory signals for the host agent or bounded gates evaluated by OpenCode++ after executor output.

## Summary

| Mode                                   | Controller                                         | Entry Points                                                                                               | Executes a code agent?                      | Best For                                                                          |
| -------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| Code agent-led, OpenCode++ constrained | Codex / Claude Code / Cursor / OpenCode / MiMoCode | CLI `plan` / `pack` / `run` / `tests` / `impact` / `verify` / `policy`, or MCP `opencode_plusplus_*` tools | No, the external code agent executes itself | Daily AI coding, MCP demos, existing agents calling tools                         |
| OpenCode++-led, code agent as executor | OpenCode++ bounded loop                            | `opencode-plusplus orchestrate` or `opencode-plusplus agent run`                                           | Yes, through `mock` or `--executor-command` | Auditable gates, CI/automation, OpenCode++ reporting finalize/repair/repack/block |

The entry points are isolated:

- `opencode-plusplus run` only writes `.agent-context/runs/<task-id>/`; it does not execute an external agent.
- `opencode-plusplus orchestrate` and `opencode-plusplus agent run` are the executor flows.
- MCP tools belong to the agent-led mode by default. They give an external agent plan/pack/retrieve/tests/impact/verify/evaluate/repair/finalize capabilities, but the host agent still decides whether to obey the gate.

## Mode 1: Code Agent-Led, OpenCode++ Constrained

In this mode, Codex / Claude Code / Cursor / OpenCode / MiMoCode is the main actor. OpenCode++ provides context, boundaries, and verification tools, but it does not own final execution.

```txt
User task
  -> code agent calls opencode-plusplus plan / pack / run or MCP opencode_plusplus_plan / pack
  -> code agent reads code, edits code, runs commands
  -> code agent calls tests / impact / verify / policy / evaluate
  -> OpenCode++ returns constraints, evidence, and recommendations
```

Recommended CLI entries:

```bash
opencode-plusplus plan "fix login timeout bug" .
opencode-plusplus pack "fix login timeout bug" .
opencode-plusplus run "fix login timeout bug" . --type bugfix
opencode-plusplus tests . --diff --base main
opencode-plusplus impact . --base main
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --trace <trace-id> --fail-on required
```

MCP entries:

```txt
opencode_plusplus_plan
opencode_plusplus_pack
opencode_plusplus_retrieve
opencode_plusplus_tests
opencode_plusplus_impact
opencode_plusplus_verify
opencode_plusplus_evaluate
opencode_plusplus_repair
opencode_plusplus_finalize
```

Artifacts:

- `.agent-context/tasks/<task-id>/`
- `.agent-context/runs/<task-id>/`
- `.agent-context/traces/<trace-id>.json`
- `.agent-context/loops/<task-id>/`, when loop/evaluate writes reports

Guarantee boundary:

- This mode guarantees that context, boundaries, test recommendations, impact reports, and policy reports are available.
- Guard findings are advisory unless the host agent chooses to obey them.
- It cannot guarantee that the external code agent follows the report, because the external agent remains the active controller in this mode.

## Mode 2: OpenCode++-Led, Code Agent As Executor

In this mode, OpenCode++ runs a bounded harness-led loop around a replaceable executor. It is not a fully autonomous coding agent: the external executor still performs real code edits, while OpenCode++ prepares context, invokes the executor, collects evidence, evaluates gates, and writes the final decision report.

```txt
User task
  -> OpenCode++ plan / pack
  -> choose executor: Codex / Claude Code / Cursor / OpenCode / MiMoCode / mock
  -> executor edits code
  -> OpenCode++ collects diff / trace / test evidence
  -> policy / contracts / tests / impact / verify
  -> decision: finalize / repair / repack / block / rollback / human-review
```

Recommended CLI entries:

```bash
opencode-plusplus orchestrate "fix login timeout bug" . --executor mock --max-loops 3 --checkpoint git-worktree --fail-on required
opencode-plusplus opencode run "fix login timeout bug" . --opencode-transcript .opencode/session.jsonl --max-loops 3 --checkpoint git-worktree --fail-on required
opencode-plusplus agent run "fix login timeout bug" . --executor mimocode --executor-command "mimocode run {prompt}" --fail-on required
```

For OpenCode, OpenCode++ normalizes `opencode run --format json` stdout, optional `--opencode-transcript` files, and generic stdout/stderr fallback into the same trace event model.

`--executor-command` supports placeholders:

- `{prompt}`: path to the executor prompt file written by OpenCode++.
- `{task}`: original task text.
- `{repo}`: repository root.
- `{runDir}`: the current iteration directory, for example `.agent-context/runs/<task-id>/iterations/001/`.
- `{agent}`: executor-specific agent/profile value.

Executor commands are parsed as argv-style executable calls and executed without a shell. Quoted paths with spaces or non-ASCII characters are preserved; shell control operators such as `&&`, `|`, `>`, `<`, `;`, and backticks are rejected. Put complex command sequences in a script and call the script directly.

Artifacts:

- `.agent-context/runs/<task-id>/`
- `.agent-context/runs/<task-id>/iterations/<nnn>/prompt.md`
- `.agent-context/runs/<task-id>/iterations/<nnn>/iteration.json` - stable schema entry for the iteration artifact directory
- `.agent-context/runs/<task-id>/iterations/<nnn>/executor.result.json` - executor command, exit code, hashes, changed files, and event summary
- `.agent-context/runs/<task-id>/iterations/<nnn>/executor.events.jsonl` - normalized `AgentEvent` JSONL from the executor
- `.agent-context/runs/<task-id>/iterations/<nnn>/diff.patch`
- `.agent-context/runs/<task-id>/iterations/<nnn>/trace.json` - schema wrapper around the normalized execution trace and trusted evidence summary
- `.agent-context/runs/<task-id>/iterations/<nnn>/guard.findings.json` - unified `GuardFinding` records from policy, hallucination, and regression checks
- `.agent-context/runs/<task-id>/iterations/<nnn>/guard.gates.json` - blocking Guard gates and required actions consumed by the orchestrator decision
- `.agent-context/runs/<task-id>/iterations/<nnn>/policy.json`
- `.agent-context/runs/<task-id>/iterations/<nnn>/verify.json`
- `.agent-context/runs/<task-id>/iterations/<nnn>/loop.json`
- `.agent-context/runs/<task-id>/iterations/<nnn>/decision.json` - explicit decision, priority, confidence, blocking status, and input signals
- `.agent-context/traces/<task-id>.json`
- `.agent-context/orchestrator/<task-id>/orchestrator.md`
- `.agent-context/orchestrator/<task-id>/orchestrator.json`
- `.agent-context/orchestrator/<task-id>/policy.md`
- `.agent-context/orchestrator/<task-id>/impact.md`
- `.agent-context/orchestrator/<task-id>/verify.md`
- `.agent-context/orchestrator/<task-id>/loop.md`

Guarantee boundary:

- This mode guarantees that each run collects diff, trace, and executor events.
- It guarantees one gate over Guard findings, policy / contracts / tests / impact / verify.
- It produces an explicit decision report: `finalize`, `repair`, `repack`, `block`, `rollback`, or `require-human-review`.
- `--checkpoint git-worktree` creates a Sandbox Gateway git worktree under `.agent-context/worktrees/<run-id>/`, runs the executor in that isolated checkout, exports the gateway patch to `.agent-context/worktrees/<run-id>/diff.patch` and mirrors each iteration patch into `.agent-context/runs/<task-id>/iterations/<nnn>/`, then discards the worktree. OpenCode++ records rollback decisions and checkpoint evidence, but it intentionally avoids destructive rollback commands in the user's working tree.
- It cannot guarantee that the external executor edits code correctly; it guarantees auditable gates and next-step decision reports after execution.

## Which Mode Should I Use?

- Use mode 1 when you want Codex / Claude Code / Cursor / OpenCode / MiMoCode to naturally call the tools.
- Use mode 2 when OpenCode++ should own the bounded gate/report loop and treat the code agent as a coding tool.
- For CI or automation demos, start with mode 2 and `--executor mock`, then wire OpenCode or MiMoCode through `--executor-command`.
