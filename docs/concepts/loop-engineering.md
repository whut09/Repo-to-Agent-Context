# Loop Engineering Code Path

OpenCode++ is moving from a context compiler into an Agent Harness Runtime Control Plane. The core loop is:

```txt
Context -> Agent -> Execution -> Trace -> Evaluation -> Context Update -> Loop
```

Current boundary: the project is a Context / Policy / Trace reporting system plus an explicit runtime state machine and bounded harness-led loop, not a fully autonomous coding agent. In harness-led mode it can invoke Codex, Claude Code, Cursor, OpenCode, or MiMoCode as an external executor, but real code edits still happen inside that executor. OpenCode++ produces evidence-linked state transitions, gate results, and decision reports that an external agent, user, or CI workflow can act on.

The project does not directly ask Codex, Claude Code, Cursor, OpenCode, or MiMoCode to edit code. Instead, it provides the control plane those agents need: what to read first, what not to edit, who is affected by a change, which tests to run, whether a run can close, and whether the next turn should rebuild context, repair contracts, add tests, expand context, or move to review.

From the Guard-module view, the loop composes several reliability checks:

- Context Guard decides what the agent should read.
- Boundary Guard decides what the agent may edit.
- Evidence Guard decides whether verification evidence is current and trustworthy.
- Impact Guard decides what modules, tests, and review surfaces are affected.
- Loop Guard decides whether to finalize, repair, repack, block, or require human review.

Hallucination Guard and Regression Guard now participate in this same loop: Hallucination Guard checks repository evidence for invented APIs/commands, while Regression Guard matches structured known-issue memory and requires anti-regression test evidence before finalize.

## Main Build Path

The build path starts at the CLI and flows through `buildContextPackage()`:

```txt
CLI command
  -> buildContextPackage()
  -> scanRepository()
  -> indexRepository()
  -> buildDependencyGraph()
  -> rankFiles()
  -> assessReadiness()
  -> summarizeRepository()
  -> calculateTokenSavings()
  -> writeContextPackage()
  -> AGENTS.md + .agent-context/*
```

`scanRepository()` collects repository facts, `indexRepository()` extracts imports, exports, symbols, routes, summaries, evidence, and confidence, `buildDependencyGraph()` builds file/module edges, and `rankFiles()` scores the files agents should read first.

## Edit Boundaries

Edit boundaries are built in three layers:

```txt
Task Pack relevant files
  -> Task Run allowedEditGlobs / avoidEditGlobs
  -> Contracts + validateContracts()
```

`buildTaskPack()` uses lexical retrieval, symbol/export/evidence matching, graph expansion, related tests, entrypoints, config files, and budget packing to select task-relevant context.

`writeTaskRun()` writes `.agent-context/runs/<task-id>/` with `plan.md`, `pack.md`, `edit-boundary.md`, `expected-diff.md`, `tests.md`, `verify.md`, `impact.md`, agent prompts, and `run.json`.

Contracts turn boundaries into checkable rules:

```txt
.agent-context/contracts/
  architecture.contract.json
  module-boundaries.json
  commands.contract.json
  test.contract.json
  safety.contract.json
```

`validateContracts()` checks protected/generated paths, lockfile pairing, env examples, architecture layers, module boundaries, and missing-test signals.

## Impact, Tests, And Verify

`buildChangeImpactReport()` uses git diff plus untracked files to find changed files. It then walks the dependency graph backwards to find direct and transitive dependents, computes risk, and recommends verification.

`buildTestSelection()` recommends:

- minimal tests for directly changed or related files
- regression tests for affected dependents
- full-confidence commands for broader validation

`renderTaskVerify()` combines changed files, affected modules, missing tests, recommended commands, contract checks, risk score, and risk factors. It is a validation report, not just a diff summary.

## Freshness And Drift

Every build writes `.agent-context/manifest.json` with hashes for source, config, index, graph, contracts, task packs, generated outputs, and generated files.

`assessFreshness()` reports whether generated context is fresh, stale, missing, or inconsistent with current source/config/index/graph/contracts/task packs/generated files.

`assessDrift()` focuses on generated output, dependency graph, task packs, and contract drift so agents can check whether `AGENTS.md` and `.agent-context/` are still trustworthy.

`update`, `delta`, and `evolve` have different product meanings:

- `opencode-plusplus update .` performs a full generated-context refresh with cache reuse.
- `opencode-plusplus delta .` reports changed context impact and agent re-read guidance without refreshing all outputs.
- `opencode-plusplus evolve .` currently performs a cache-aware full refresh plus `.agent-context/delta/latest.*` output. It prints cache stats and rewritten outputs so users can see what was reused. Selective writes of only affected outputs are planned.

## Loop Controller

`buildLoopControllerReport()` combines freshness, drift, contracts, impact, changed files, tests, task-pack budget, and optional trace evidence. It supports `preflight`, `after-edit`, and `repair` phases and returns decisions such as:

- `start-agent`
- `rebuild-context`
- `replan`
- `expand-context`
- `repair-contracts`
- `add-or-update-tests`
- `run-tests`
- `ready-for-review`

Each decision is machine-readable and includes `action`, `priority`, `confidence`, `blocking`, `signals`, `reason`, and an optional `command`. This lets agents sort the next actions by urgency and tell the difference between a blocking gate, such as missing tests, and a non-blocking handoff, such as starting the first agent turn.

When a trace id is supplied, the controller reads passed test evidence from `.agent-context/traces/<trace-id>.json`. If changed files already have passed test evidence, the controller no longer emits `run-tests`; it can move to `ready-for-review` unless freshness, drift, contract, budget, or impact signals still block the loop.

The controller also updates `.agent-context/runs/<task-id>/state.json` when `opencode-plusplus loop "<task>" . --write` is used. That file stores:

```json
{
  "state": "EDITED",
  "taskId": "fix-timeout-bug",
  "repoHash": "...",
  "contextHash": "...",
  "diffHash": "...",
  "lastAction": "agent_edit",
  "nextAction": {
    "type": "run_tests",
    "blocking": true,
    "reason": "changed source files without command evidence"
  },
  "satisfiedEvidence": ["context_fresh", "contracts_valid"],
  "missingEvidence": ["required_tests_passed"]
}
```

The state model is explicit: `EMPTY`, `CONTEXT_READY`, `TASK_PACK_READY`, `EDIT_BOUNDARY_READY`, `AGENT_STARTED`, `EDITED`, `VERIFYING`, `REPAIRING`, `READY_FOR_REVIEW`, and `BLOCKED`. This is the bridge from static context generation to loop engineering: every turn can be evaluated against repository state, verification evidence, and the previously persisted runtime state.

## Trace And Policy

`opencode-plusplus run "<task>" .` creates a task run and trace. `opencode-plusplus trace start/add/run/show` can also manage traces directly. A trace records agent identity, ordered steps, touched files, reasons, commands, test results, output summaries, and final state.

Trace evidence is split into three levels:

- `manual evidence`: an agent or human records a claim with `trace add`; useful for edit intent and observations.
- `command evidence`: the harness executes the command with `trace run` and captures `exitCode`, timestamps, stdout/stderr hashes, and working-tree hashes before and after the command.
- `ci evidence`: external verification from CI artifacts or GitHub Actions imported into a trace step.

Trace steps are validated before they satisfy a loop requirement. `evidenceSatisfies()` checks the requirement type, required command match, exit code, current actionable working-tree hash, and whether the evidence was recorded after the last edit step. This prevents a false loop close where an agent runs tests, edits code again, and reuses the old passing test evidence.

The Policy Engine prefers CI and harness-captured command evidence. Manual test evidence can satisfy a required check for compatibility, but it is reported as a risk because it does not prove a command was actually executed.

`opencode-plusplus policy . --base main --trace <trace-id>` merges diff, contracts, freshness, and trace evidence. It can block forbidden edits, flag risky behavior, and require test, contract, or context-refresh evidence before a loop is considered complete.

`policy --fail-on` controls how hard the gate is:

- `forbidden`: fail only forbidden edits.
- `required`: fail forbidden edits and missing required actions; this is the default and fits PR checks.
- `risk`: fail forbidden, required, and risk warnings; this is equivalent to `--strict` and fits main-branch or release gates.

## Multi-Loop Orchestrator

`opencode-plusplus orchestrate "<task>" . --max-loops 3` is the harness-led runtime path. It repeatedly builds or refreshes the task pack, invokes the selected executor, normalizes executor evidence, evaluates policy / impact / verify / loop signals, then decides one of:

- `finalize`
- `repair`
- `repack`
- `block`
- `rollback`
- `human-review`

Each loop writes a durable iteration directory:

```txt
.agent-context/runs/<task-id>/iterations/001/
  prompt.md
  iteration.json
  executor.result.json
  executor.events.jsonl
  diff.patch
  trace.json
  guard.findings.json
  guard.gates.json
  policy.json
  verify.json
  loop.json
  decision.json
```

`iteration.json` is the stable directory index. `executor.result.json` records the executor command, exit code, hashes, changed files, and normalized event summary. `trace.json` is a schema wrapper around the normalized execution trace and trusted evidence summary. `guard.findings.json` normalizes policy, hallucination, and regression findings into one `GuardFinding` schema. `guard.gates.json` turns Guard findings into blocking conditions and required actions. `decision.json` records the selected action with priority, confidence, blocking status, input signals, and convergence state.

`executor.events.jsonl` stores normalized `AgentEvent` records. OpenCode currently supports `opencode run --format json` stdout, optional transcript files, and generic stdout/stderr fallback; later executor adapters can produce the same event model for MiMoCode, Codex, Claude Code, and Cursor.

Each iteration computes a deterministic state fingerprint from the working-tree hash, raw decision action, blocking finding and gate IDs, missing evidence, required commands, and context freshness/drift. Array inputs are normalized before hashing. If two consecutive blocking iterations have the same fingerprint, the orchestrator stops early with `human-review` and the explicit reason `repeated-state/no-progress`. A changed diff, evidence set, command set, context state, or decision action produces a new fingerprint and is treated as progress.

`repair` and `repack` continue until a blocking/final decision, repeated state, or `--max-loops` is reached. The report distinguishes `repeated-state`, `max-loops-reached`, `executor-failure`, and existing terminal decisions. `--checkpoint git-worktree` creates a Sandbox Gateway git worktree under `.agent-context/worktrees/<run-id>/` for executor edits, exports patches to `.agent-context/worktrees/<run-id>/diff.patch` and mirrors per-iteration patches into the run directory, and discards the sandbox after the final gate. Rollback decisions are recorded, but destructive working-tree rollback is intentionally not automatic.

## CLI Surface

The runtime is exposed through CLI commands, including:

```txt
sidecar, report, status, doctor, opencode/oc run, build, run,
loop, plan, pack, verify, task, tests, impact, policy,
hallucination, regression, validate-contracts, freshness, drift,
delta, evolve, trace start/add/run/show, rag search, retrieve,
orchestrate, agent run, benchmark, benchmark-agent, diff, update,
explain
```

The follow-up release check is to keep the npm package, `dist/`, CLI help, and docs aligned with this surface.
