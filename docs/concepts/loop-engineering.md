# Loop Engineering Code Path

[中文](loop-engineering.zh-CN.md) | English

OpenCode++ is moving from a context compiler into an Agent Harness Runtime Control Plane. The core loop is:

```txt
Context -> Agent -> Execution -> Trace -> Evaluation -> Context Update -> Loop
```

For ordinary Windows users, this loop is exposed through the in-process OpenCode Desktop plugin. OpenCode owns the model conversation, file edits, and command execution; plugin tools and hooks collect the bounded state used by the loop. The CLI `orchestrate` command described below is an optional developer automation surface that owns an external executor loop, not a second Desktop runtime.

## Intervention Ledger

Each harness iteration also writes an Intervention Ledger under `.agent-context/interventions/`. The ledger answers two separate questions: what OpenCode++ observed or prevented, and whether a proposed repair was actually verified. Every event links back to its finding, decision, trace, and evidence references.

The status model is deliberately conservative:

- `observed`: a signal was recorded without an intervention claim.
- `prevented`: a guard stopped a boundary or unsafe action; this never means repaired.
- `requested`: the harness requires a command, context refresh, or human action.
- `repaired`: an executor reported a change, but verification is still pending.
- `verified`: current-working-tree command or CI evidence passed after the repair.
- `unresolved`: execution or verification still failed.
- `human-review`: the harness cannot safely decide automatically.
- `stale`: earlier evidence was superseded by a later edit.

Manual claims can remain visible as context, but cannot create `verified`. Reports show the active intervention IDs, problem, action, status, and evidence references so a user can inspect exactly what changed and why the loop stopped.

### Context, Authority, And Explanation

Context Registry is upstream of the loop, but deliberately outside its authority chain:

```text
Context Pack / annotation -> Retrieval -> suggested inspection or action
Guard / Policy            -> allowed action and blocking conditions
Evidence                  -> current-working-tree verification
Intervention Ledger       -> explanation of outcome and remaining work
```

External Context can prioritize files, describe an API, or propose a workaround. It cannot issue a command, relax a Guard, satisfy a contract, make Context fresh, or close a finalization requirement. Annotation is repository-local, user-written, untrusted memory; it is not policy. Only a current command or CI result that satisfies the active evidence policy can transition a repair to `verified`. A later source edit supersedes that result and records `stale`, not fixed.

This distinction controls the Desktop experience. A report can say a file was selected, a path or command was prevented, a repair was suggested or reported, a fresh test verified a repair, or an item still needs human review. It must not call prevention a repair or call a suggestion a verified fix.

To extend the Harness, add Context Packs for advisory domain knowledge, then encode enforceable team requirements as tested Guard or Policy rules. Keep custom Context fetchers offline by default, validate provenance and paths, and preserve the same Evidence and Intervention state transitions so custom guidance cannot bypass verification.

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

## Incremental Context Refresh

Harness iterations do not rebuild repository context unconditionally. The Orchestrator compares the previous decision, the working-tree hash captured for the current context, and files actually modified by the executor:

| Signal                                                                      | Refresh mode  | Behavior                                                                                                 |
| --------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `repack` or generated-context drift                                         | `rebuilt`     | Calls `buildContextPackage(..., { cache: false })`.                                                      |
| Dependency or project configuration changed                                 | `rebuilt`     | Invalidates index, graph, and dependency-sensitive analysis.                                             |
| Source changed during `repair` or another edit action                       | `incremental` | Calls `buildContextPackage(..., { cache: true })` so unchanged file indexes and token counts are reused. |
| `run-tests`, identical working-tree hash, or no executor file modifications | `reused`      | Reuses the in-memory context and only refreshes trace, evidence, policy, Guard Gates, and decisions.     |

Dependency-invalidating inputs include package manifests and lockfiles, `tsconfig*.json` / `jsconfig*.json`, language dependency manifests, and `opencode-plusplus.config.*`. Missing executor modification metadata is treated conservatively: a changed working-tree hash triggers an incremental build rather than an unsafe reuse.

Freshness and drift checks still run during evaluation. Reuse only skips context construction; it does not skip evidence, policy, Guard Gate, freshness, or drift evaluation. Incremental builds use the same `buildContextPackage()` pipeline as full builds, and regression tests compare their semantic outputs with cache statistics removed.

Every iteration report and `iteration.json` records `contextRefresh` metrics: `mode`, reason, cache hit/miss booleans and counts, context build count, and build duration. These fields make multi-loop cache effectiveness measurable and allow benchmarks to compare actual context builds with the previous one-build-per-round behavior.

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

Trace steps are validated before they satisfy a loop requirement. `evidenceSatisfies()` checks the requirement type, evidence policy, required command match, exit code, current actionable working-tree hash, and whether the evidence was recorded after the last edit step. It also reports `claimed` separately from `verified`, so a user or agent statement is not presented as system verification. This prevents a false loop close where an agent runs tests, edits code again, and reuses the old passing test evidence.

Runtime persistence is explanatory and recoverable, not a capability grant. Context cache, source snapshots, usage, annotations, feedback, traces, reports, and intervention events are stored below `.agent-context/` with atomic writes and revisions. Cache reuse never skips freshness, drift, policy, or Guard evaluation. Corrupt state, stale locks, unavailable remote sources, Windows permission errors, and transient antivirus file locks return diagnostics or a safe human-review outcome rather than silently producing a pass.

The shared evidence policy is used by the Loop Controller, Policy Engine, regression Guard, Guard Gate inputs, and Orchestrator:

- `advisory` keeps the compatibility behavior: manual evidence can satisfy a requirement but remains an unverified claim.
- `balanced` requires command or CI test evidence after source/config changes, while allowing manual evidence for non-critical checks.
- `strict` requires current-tree command or CI evidence for both tests and contract validation; manual evidence cannot close a blocking requirement.

The configuration default remains `advisory` for old projects, while `balanced` is recommended for new PR workflows. Use `--evidence-policy` on `policy`, `loop`, `orchestrate`, or `agent run`; MCP runtime tools expose the same `evidencePolicy` input.

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

`iteration.json` is the stable directory index. `executor.result.json` records the executor command, exit code, hashes, changed files, and normalized event summary. `trace.json` is a schema wrapper around the normalized execution trace and trusted evidence summary. `guard.findings.json` normalizes policy, hallucination, and regression findings into one `GuardFinding` schema. `guard.gates.json` turns Guard findings into blocking conditions and required actions. `decision.json` records the selected action with priority, confidence, blocking status, input signals, convergence state, and decision arbitration details.

Decision arbitration converts executor failures, forbidden policy findings, every blocking Guard Gate, blocking Loop decisions, missing required policy evidence, and risk signals into normalized candidates. Candidates are sorted by the shared action priority (`rollback`, `block`, `repack`, `repair`, `run-tests`, `human-review`, `finalize`), then confidence and stable candidate ID. The highest-priority candidate supplies the action; all remaining candidates stay visible as supporting blockers and contribute deduplicated commands and artifacts. Reordering Guard Gates therefore cannot change the selected decision.

`executor.events.jsonl` stores normalized `AgentEvent` records. OpenCode currently supports `opencode run --format json` stdout, optional transcript files, and generic stdout/stderr fallback; later executor adapters can produce the same event model for MiMoCode, Codex, Claude Code, and Cursor.

Each iteration computes a deterministic state fingerprint from the working-tree hash, raw decision action, blocking finding and gate IDs, missing evidence, required commands, and context freshness/drift. Array inputs are normalized before hashing. If two consecutive blocking iterations have the same fingerprint, the orchestrator stops early with `human-review` and the explicit reason `repeated-state/no-progress`. A changed diff, evidence set, command set, context state, or decision action produces a new fingerprint and is treated as progress.

`repair` and `repack` continue until a blocking/final decision, repeated state, or `--max-loops` is reached. The report distinguishes `repeated-state`, `max-loops-reached`, `executor-failure`, and existing terminal decisions. `--checkpoint git-worktree` creates a Sandbox Gateway git worktree under `.agent-context/worktrees/<run-id>/` for executor edits, exports patches to `.agent-context/worktrees/<run-id>/diff.patch` and mirrors per-iteration patches into the run directory, and discards the sandbox after the final gate. Rollback decisions are recorded, but destructive working-tree rollback is intentionally not automatic.

The Orchestrator is implemented as explicit `Plan`, `PrepareSandbox`, `Execute`, `Collect`, `Evaluate`, `Decide`, `Persist`, and `Finalize` phases. Each phase has typed inputs/outputs; executor adapters, evaluation, decision arbitration, and iteration persistence live in separate modules rather than the top-level coordinator. After every phase, `.agent-context/orchestrator/<run-id>/state.json` is atomically updated with the current phase, iteration, completed phases, artifact references, trace reference, fingerprints, decision, convergence, and timestamps.

Use `orchestrate ... --resume <run-id>`, `agent run ... --resume <run-id>`, or `opencode run ... --resume <run-id>` after interruption. Resume loads persisted Execute/Collect/Evaluate outputs and does not rerun completed phases. Trace writes carry deterministic per-iteration markers and artifact writes replace their target atomically, making repeated resume idempotent. Unsupported state schema versions fail explicitly. Git-worktree sandboxes are recreated from the persisted patch when necessary and discarded on success, executor failure, interruption, or exception.

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
