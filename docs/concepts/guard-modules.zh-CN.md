# Guard Modules

[English](guard-modules.md) | 中文

OpenCode++ 的 Guard 模块是围绕 Code Agent 失败模式设计的外挂可靠性组件。每个 Guard 都把一种常见工程问题映射成可检查输入、生成物、gate 行为和决策报告。

统一模型：

```txt
失败模式
  -> 收集证据
  -> 生成 finding
  -> 形成 gate
  -> 输出 orchestrator decision report
```

## 成熟度总览

| Guard                               | 解决的问题                        | 成熟度               |
| ----------------------------------- | --------------------------------- | -------------------- |
| Context Guard                       | 上下文不准、乱搜文件、token 浪费  | Stable / Foundation  |
| Boundary Guard                      | 修改范围失控、误改 protected path | Foundation           |
| Evidence Guard                      | 测试证据不可信或过期              | Foundation           |
| Impact Guard                        | 影响范围不可见、review 风险不清楚 | Stable / Foundation  |
| Hallucination Guard                 | 幻觉 API、命令、配置、文件、符号  | MVP                  |
| Regression Guard                    | 重新引入历史 bug                  | MVP / Foundation     |
| Loop Guard                          | repair loop 无法收口              | Foundation           |
| Executor Adapter + Trace Normalizer | 不同 Agent 事件格式不统一         | Foundation / Planned |

## Gate 产物

在 harness-led run 中，每轮迭代都会写入：

```txt
.agent-context/runs/<run-id>/iterations/<n>/
  guard.findings.json
  guard.gates.json
  decision.json
```

`guard.findings.json` 记录标准化证据。`guard.gates.json` 把 finding 转成 blocking 或 advisory gate。`decision.json` 记录 orchestrator 的决策报告，例如 `finalize`、`repair`、`repack`、`block`、`rollback` 或 `require-human-review`。

## Context Guard

### Solves

上下文不准、盲目搜索文件、token 浪费，以及 Agent 还没读对文件就开始改代码。

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
- MCP: `opencode_plusplus_build`、`opencode_plusplus_plan`、`opencode_plusplus_pack`、`opencode_plusplus_retrieve`

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

### Gate behavior

| Finding                           | Severity | Action                       |
| --------------------------------- | -------- | ---------------------------- |
| generated context stale           | required | `repack` / `rebuild-context` |
| task pack 超出 token budget       | required | `repack`                     |
| task pack 缺少 must-inspect files | risk     | `expand-context`             |
| 低置信度分析影响选中文件          | risk     | `human-review`               |

### Maturity

build/task-pack 产物是 Stable；gate 行为和任务级检索扩展是 Foundation。

## Boundary Guard

### Solves

修改范围失控、误改 protected path、误改生成物，以及局部任务演变成大范围重构。

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
- MCP: `opencode_plusplus_evaluate`、`opencode_plusplus_verify`

### Artifacts

- `.agent-context/contracts/safety.contract.json`
- `.agent-context/contracts/module-boundaries.json`
- `.agent-context/contracts/architecture.contract.json`
- `.agent-context/runs/<run-id>/edit-boundary.md`
- `.agent-context/runs/<run-id>/iterations/<n>/guard.gates.json`

### Gate behavior

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

测试声明不可信、验证证据过期、测试后继续改代码，以及只有自然语言“测试通过”但没有命令证据。

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
- MCP: `opencode_plusplus_step`、`opencode_plusplus_evaluate`、`opencode_plusplus_finalize`

### Artifacts

- `.agent-context/traces/<trace-id>.json`
- `.agent-context/runs/<run-id>/verify.md`
- `.agent-context/runs/<run-id>/iterations/<n>/trace.json`
- `.agent-context/runs/<run-id>/iterations/<n>/policy.json`

### Gate behavior

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

diff 的影响范围不可见、遗漏下游测试、仅靠 changed files 无法判断 review 风险。

### Inputs

- changed files
- dependency graph
- module map
- related tests
- key-file ranking
- configured CodeGraph backend output

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
- MCP: `opencode_plusplus_impact`、`opencode_plusplus_tests`、`opencode_plusplus_verify`

### Artifacts

- `.agent-context/runs/<run-id>/impact.md`
- `.agent-context/runs/<run-id>/tests.md`
- `.agent-context/runs/<run-id>/verify.md`
- `.agent-context/graphs/dependencies.json`

### Gate behavior

| Finding                                           | Severity | Action                            |
| ------------------------------------------------- | -------- | --------------------------------- |
| high-impact dependency blast radius               | risk     | `expand-context` / `human-review` |
| changed source lacks related tests                | required | `run-tests`                       |
| transitive dependents exist but are not inspected | risk     | `expand-context`                  |
| sensitive module changed                          | risk     | `human-review`                    |

### Maturity

CLI 报告是 Stable；guard-gate 集成是 Foundation。

## Hallucination Guard

### Solves

不存在的文件、package script、依赖、配置/环境变量，以及仓库证据无法证明存在的 imported symbol。

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
- MCP: `opencode_plusplus_evaluate`、`opencode_plusplus_repair`

### Artifacts

- `.agent-context/hallucination/<task-id>.json`
- `.agent-context/runs/<run-id>/hallucination.md`
- `.agent-context/runs/<run-id>/iterations/<n>/guard.findings.json`
- `.agent-context/runs/<run-id>/iterations/<n>/guard.gates.json`

### Gate behavior

| Finding                       | Severity  | Action                    |
| ----------------------------- | --------- | ------------------------- |
| nonexistent package script    | required  | `repair`                  |
| nonexistent local import file | forbidden | `repair` / `block`        |
| nonexistent imported symbol   | forbidden | `repair` / `block`        |
| undeclared dependency         | risk      | `repair` / `human-review` |
| missing env/config key        | risk      | `human-review`            |

### Maturity

MVP。确定性检查已实现，语义级项目约定检查仍在计划中。

## Regression Guard

### Solves

重新引入历史 bug、修改 fragile module 但缺少回归测试，以及 Agent session 之间丢失项目修复记忆。

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
- MCP: `opencode_plusplus_evaluate`、`opencode_plusplus_repair`

### Artifacts

- `.agent-context/regression/known-issues.json`
- `.agent-context/regression/fix-history.json`
- `.agent-context/regression/fragile-modules.json`
- `.agent-context/regression/anti-regression-tests.json`
- `.agent-context/memory/candidates/*.json`
- `.agent-context/runs/<run-id>/regression.md`

### Gate behavior

| Finding                                    | Severity | Action                            |
| ------------------------------------------ | -------- | --------------------------------- |
| historical bug pattern matched             | required | `run-regression-tests`            |
| fragile module changed                     | risk     | `human-review`                    |
| required regression test evidence missing  | required | `run-regression-tests` / `repair` |
| memory candidate created but not confirmed | info     | `human-review`                    |

### Maturity

regression matching 是 MVP；memory candidate 和显式确认流程是 Foundation。

## Loop Guard

### Solves

过早 finalize、无限 repair loop、下一步动作不清晰，以及 Agent 只靠自然语言自证完成。

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
- MCP: `opencode_plusplus_start_loop`、`opencode_plusplus_step`、`opencode_plusplus_evaluate`、`opencode_plusplus_repair`、`opencode_plusplus_finalize`

### Artifacts

- `.agent-context/loops/<task-id>/loop.md`
- `.agent-context/loops/<task-id>/loop.json`
- `.agent-context/runs/<run-id>/state.json`
- `.agent-context/runs/<run-id>/iterations/<n>/decision.json`

### Gate behavior

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

不同 Code Agent 会产生不同的事件格式、命令日志、transcript 和 final output。

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

### Gate behavior

| Finding                             | Severity | Action                    |
| ----------------------------------- | -------- | ------------------------- |
| executor command missing            | required | `block`                   |
| executor exits non-zero             | required | `repair` / `human-review` |
| no changed files when edit expected | risk     | `repair`                  |
| transcript cannot be parsed         | risk     | `human-review`            |

### Maturity

mock、generic command adapter、OpenCode normalizer 是 Foundation。MiMoCode、Codex JSONL、Claude Code transcript、Cursor native adapters 仍在计划中。
