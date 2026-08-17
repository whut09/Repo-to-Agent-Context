# Guard Modules

[中文](guard-modules.zh-CN.md) | English

OpenCode++ Guard modules are external reliability components for coding agents. Each Guard maps one common failure mode to checkable inputs, generated artifacts, gate behavior, and decision reports.

Every Guard follows the same contract:

```txt
failure mode
  -> evidence collection
  -> finding
  -> gate behavior
  -> orchestrator decision report
```

## Maturity Summary

| Guard                               | Solves                                          | Maturity             |
| ----------------------------------- | ----------------------------------------------- | -------------------- |
| Context Guard                       | Wrong context, irrelevant search, token waste   | Stable / Foundation  |
| Boundary Guard                      | Scope expansion and protected-path edits        | Foundation           |
| Evidence Guard                      | Untrustworthy or stale test evidence            | Foundation           |
| Impact Guard                        | Invisible blast radius and review risk          | Stable / Foundation  |
| Hallucination Guard                 | Invented APIs, commands, config, files, symbols | MVP                  |
| Regression Guard                    | Reintroducing historical bugs                   | MVP / Foundation     |
| Loop Guard                          | Repair loops that do not converge               | Foundation           |
| Executor Adapter + Trace Normalizer | Inconsistent agent event formats                | Foundation / Planned |

## Gate Artifacts

In harness-led runs, Guard output is written per iteration:

```txt
.agent-context/runs/<run-id>/iterations/<n>/
  guard.findings.json
  guard.gates.json
  decision.json
```

`guard.findings.json` records normalized evidence. `guard.gates.json` turns findings into blocking or advisory gates. `decision.json` records the orchestrator decision report, such as `finalize`, `repair`, `repack`, `block`, `rollback`, or `require-human-review`.

## Context Guard

### Solves

Wrong context, blind file search, token waste, and agents editing before reading the right files.

### Inputs

- repository scan
- file index
- symbol index
- dependency graph
- key-file ranking
- task text
- git diff
- token budget

### Outputs

- minimal `AGENTS.md`
- repository summary
- key files
- module map
- task plan
- task pack
- context layers
- RAG-ready chunks

### CLI / MCP

- `opencode-plusplus build`
- `opencode-plusplus plan`
- `opencode-plusplus pack`
- `opencode-plusplus run`
- `opencode-plusplus retrieve`
- MCP: `opencode_plusplus_build`, `opencode_plusplus_plan`, `opencode_plusplus_pack`, `opencode_plusplus_retrieve`

### Artifacts

- `AGENTS.md`
- `.agent-context/repo-summary.md`
- `.agent-context/key-files.md`
- `.agent-context/module-map.md`
- `.agent-context/context-layers.md`
- `.agent-context/tasks/`
- `.agent-context/runs/<run-id>/pack.md`
- `.agent-context/index/`
- `.agent-context/rag/documents.jsonl`

### Gate Behavior

| Finding                                       | Severity | Action                       |
| --------------------------------------------- | -------- | ---------------------------- |
| generated context is stale                    | required | `repack` / `rebuild-context` |
| task pack exceeds token budget                | required | `repack`                     |
| task pack missing must-inspect files          | risk     | `expand-context`             |
| low-confidence analysis drives selected files | risk     | `human-review`               |

### Maturity

Stable for build/task-pack artifacts. Foundation for gate behavior and task-aware retrieval expansion.

## Boundary Guard

### Solves

Edit scope expansion, accidental protected-path changes, generated output edits, and local tasks turning into broad refactors.

### Inputs

- task pack
- file classification
- contracts
- protected path rules
- changed files
- module boundaries
- package and lockfile signals

### Outputs

- allowed edit paths
- denied edit paths
- protected path findings
- module-boundary findings
- generated / lockfile / migration / CI / deploy risk findings

### CLI / MCP

- `opencode-plusplus validate-contracts`
- `opencode-plusplus policy`
- `opencode-plusplus verify`
- MCP: `opencode_plusplus_evaluate`, `opencode_plusplus_verify`

### Artifacts

- `.agent-context/contracts/safety.contract.json`
- `.agent-context/contracts/module-boundaries.json`
- `.agent-context/contracts/architecture.contract.json`
- `.agent-context/runs/<run-id>/edit-boundary.md`
- `.agent-context/runs/<run-id>/iterations/<n>/guard.gates.json`

### Gate Behavior

| Finding                                             | Severity  | Action                    |
| --------------------------------------------------- | --------- | ------------------------- |
| protected path changed                              | forbidden | `rollback` / `block`      |
| generated source changed                            | forbidden | `rollback` / `block`      |
| lockfile changed without manifest pairing           | required  | `repair` / `human-review` |
| CI / migration / deploy config changed unexpectedly | risk      | `human-review`            |
| large unexpected diff                               | risk      | `human-review`            |

### Maturity

Implemented foundation.

## Evidence Guard

### Solves

Untrustworthy test claims, stale verification evidence, tests run before later edits, and natural-language "tests passed" summaries without command proof.

### Inputs

- execution trace
- command evidence
- test recommendations
- current working-tree hash
- last edit timestamp
- stdout/stderr hashes
- policy requirements

### Outputs

- command evidence records
- stale evidence findings
- missing evidence findings
- test evidence satisfaction result
- contract evidence satisfaction result

### CLI / MCP

- `opencode-plusplus trace run`
- `opencode-plusplus trace show`
- `opencode-plusplus policy --trace <trace-id>`
- `opencode-plusplus loop --trace <trace-id>`
- MCP: `opencode_plusplus_step`, `opencode_plusplus_evaluate`, `opencode_plusplus_finalize`

### Artifacts

- `.agent-context/traces/<trace-id>.json`
- `.agent-context/runs/<run-id>/verify.md`
- `.agent-context/runs/<run-id>/iterations/<n>/trace.json`
- `.agent-context/runs/<run-id>/iterations/<n>/policy.json`

### Gate Behavior

| Finding                              | Severity  | Action                 |
| ------------------------------------ | --------- | ---------------------- |
| no test command after last edit      | required  | `run-tests`            |
| test exit code is non-zero           | forbidden | `repair`               |
| evidence working-tree hash is stale  | required  | `run-tests`            |
| only manual test evidence exists     | risk      | `human-review`         |
| contract validation evidence missing | required  | `repair` / `run-tests` |

### Maturity

Implemented foundation.

## Impact Guard

### Solves

Invisible blast radius, missing dependent tests, review risk that is not obvious from changed files alone.

### Inputs

- changed files
- dependency graph
- module map
- related tests
- key-file ranking
- CodeGraph backend output when configured

### Outputs

- direct dependents
- transitive dependents
- affected modules
- related tests
- risk score
- required verification commands

### CLI / MCP

- `opencode-plusplus impact`
- `opencode-plusplus tests`
- `opencode-plusplus verify`
- MCP: `opencode_plusplus_impact`, `opencode_plusplus_tests`, `opencode_plusplus_verify`

### Artifacts

- `.agent-context/runs/<run-id>/impact.md`
- `.agent-context/runs/<run-id>/tests.md`
- `.agent-context/runs/<run-id>/verify.md`
- `.agent-context/graphs/dependencies.json`

### Gate Behavior

| Finding                                           | Severity | Action                            |
| ------------------------------------------------- | -------- | --------------------------------- |
| high-impact dependency blast radius               | risk     | `expand-context` / `human-review` |
| changed source lacks related tests                | required | `run-tests`                       |
| transitive dependents exist but are not inspected | risk     | `expand-context`                  |
| sensitive module changed                          | risk     | `human-review`                    |

### Maturity

Stable for CLI reports. Foundation for guard-gate integration.

## Hallucination Guard

### Solves

Invented files, nonexistent package scripts, missing dependencies, missing config/env keys, and imported symbols that repository evidence cannot prove.

### Inputs

- execution trace
- normalized executor events
- git diff
- changed files
- package scripts
- dependency declarations
- env examples
- config files
- symbol/export index

### Outputs

- missing file findings
- missing command findings
- missing dependency findings
- missing config/env findings
- missing symbol/export findings
- repair suggestions

### CLI / MCP

- `opencode-plusplus hallucination`
- `opencode-plusplus policy`
- `opencode-plusplus orchestrate`
- MCP: `opencode_plusplus_evaluate`, `opencode_plusplus_repair`

### Artifacts

- `.agent-context/hallucination/<task-id>.json`
- `.agent-context/runs/<run-id>/hallucination.md`
- `.agent-context/runs/<run-id>/iterations/<n>/guard.findings.json`
- `.agent-context/runs/<run-id>/iterations/<n>/guard.gates.json`

### Gate Behavior

| Finding                       | Severity  | Action                    |
| ----------------------------- | --------- | ------------------------- |
| nonexistent package script    | required  | `repair`                  |
| nonexistent local import file | forbidden | `repair` / `block`        |
| nonexistent imported symbol   | forbidden | `repair` / `block`        |
| undeclared dependency         | risk      | `repair` / `human-review` |
| missing env/config key        | risk      | `human-review`            |

### Maturity

MVP. Deterministic checks are implemented; semantic convention checks are planned.

## Regression Guard

### Solves

Reintroducing historical bugs, changing fragile modules without anti-regression tests, and losing project memory across agent sessions.

### Inputs

- structured regression memory
- task text
- changed files
- affected modules
- trace evidence
- test recommendations

### Outputs

- anti-regression notes
- required regression tests
- historical-risk findings
- regression memory candidates
- repair suggestions

### CLI / MCP

- `opencode-plusplus regression`
- `opencode-plusplus memory learn-from-pr`
- `opencode-plusplus memory add-fix`
- `opencode-plusplus policy`
- MCP: `opencode_plusplus_evaluate`, `opencode_plusplus_repair`

### Artifacts

- `.agent-context/regression/known-issues.json`
- `.agent-context/regression/fix-history.json`
- `.agent-context/regression/fragile-modules.json`
- `.agent-context/regression/anti-regression-tests.json`
- `.agent-context/memory/candidates/*.json`
- `.agent-context/runs/<run-id>/regression.md`

### Gate Behavior

| Finding                                    | Severity | Action                            |
| ------------------------------------------ | -------- | --------------------------------- |
| historical bug pattern matched             | required | `run-regression-tests`            |
| fragile module changed                     | risk     | `human-review`                    |
| required regression test evidence missing  | required | `run-regression-tests` / `repair` |
| memory candidate created but not confirmed | info     | `human-review`                    |

### Maturity

MVP for regression matching. Foundation for memory candidates and explicit confirmation.

## Loop Guard

### Solves

Premature finalization, endless repair loops, unclear next actions, and agents self-certifying completion.

### Inputs

- runtime state
- task pack
- freshness / drift
- policy report
- impact report
- trace evidence
- guard gates
- test recommendations

### Outputs

- next action
- blocking flag
- confidence score
- reasons
- required commands
- state transitions
- final decision report

### CLI / MCP

- `opencode-plusplus loop`
- `opencode-plusplus orchestrate`
- MCP: `opencode_plusplus_start_loop`, `opencode_plusplus_step`, `opencode_plusplus_evaluate`, `opencode_plusplus_repair`, `opencode_plusplus_finalize`

### Artifacts

- `.agent-context/loops/<task-id>/loop.md`
- `.agent-context/loops/<task-id>/loop.json`
- `.agent-context/runs/<run-id>/state.json`
- `.agent-context/runs/<run-id>/iterations/<n>/decision.json`

### Gate Behavior

| Finding                    | Severity             | Action                          |
| -------------------------- | -------------------- | ------------------------------- |
| stale context              | required             | `repack` / `rebuild-context`    |
| blocking guard gate exists | forbidden / required | `repair` / `block` / `rollback` |
| tests missing after edit   | required             | `run-tests`                     |
| max loops reached          | required             | `require-human-review`          |
| all gates satisfied        | info                 | `finalize`                      |

### Maturity

Implemented foundation.

## Executor Adapter + Trace Normalizer

### Solves

Different coding agents produce different event formats, command logs, transcripts, and final outputs.

### Inputs

- executor command template
- stdout / stderr
- OpenCode JSON stdout
- OpenCode transcript
- changed files
- diff patch
- command events

### Outputs

- normalized agent events
- execution trace steps
- executor result summary
- changed file list
- diff patch

### CLI / MCP

- `opencode-plusplus agent run`
- `opencode-plusplus orchestrate`
- `--executor mock|opencode|mimocode|codex|claude-code|cursor`
- `--executor-command "<command with {prompt}>"`
- `--opencode-transcript <path>`

### Artifacts

- `.agent-context/runs/<run-id>/iterations/<n>/executor.result.json`
- `.agent-context/runs/<run-id>/iterations/<n>/executor.events.jsonl`
- `.agent-context/runs/<run-id>/iterations/<n>/trace.json`
- `.agent-context/runs/<run-id>/iterations/<n>/diff.patch`

### Gate Behavior

| Finding                             | Severity | Action                    |
| ----------------------------------- | -------- | ------------------------- |
| executor command missing            | required | `block`                   |
| executor exits non-zero             | required | `repair` / `human-review` |
| no changed files when edit expected | risk     | `repair`                  |
| transcript cannot be parsed         | risk     | `human-review`            |

### Maturity

Foundation for mock, generic command adapter, and OpenCode normalizer. MiMoCode, Codex JSONL, Claude Code transcript, and Cursor native adapters are planned.
