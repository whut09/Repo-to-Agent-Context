# Loop Engineering 源码链路

[English](loop-engineering.md) | 中文

这份文档按代码执行链路解释 OpenCode++ 如何从 Context Compiler 走向 Agent Harness Runtime 控制面。它不是只生成摘要文件，也不替代 Codex / Claude Code / Cursor / OpenCode / MiMoCode 写代码，而是把仓库状态、任务上下文、编辑边界、测试建议、影响分析、contracts、trace、freshness 和 loop decision 组合成一个静态但可验证的 Agent Runtime Loop 控制面。

核心闭环是：

```txt
Context -> Agent -> Execution -> Trace -> Evaluation -> Context Update -> Loop
```

## 介入记录 Ledger

每轮 Harness 会在 `.agent-context/interventions/` 写入 Intervention Ledger（介入记录）。它明确区分两件事：OpenCode++ 观察到或阻止了什么，以及某个修复是否真的被验证。每条记录都能反查对应的 finding、decision、trace 和 evidence。

状态模型保持保守：

- `observed`：记录了信号，但没有声称介入。
- `prevented`：Guard 阻止了越界或不安全动作；这绝不等于已修复。
- `requested`：要求执行命令、刷新上下文或进行人工处理。
- `repaired`：executor 报告已经修改，但验证仍未完成。
- `verified`：修改后，当前 working tree 上的 command 或 CI 证据通过。
- `unresolved`：执行或验证仍然失败。
- `human-review`：系统无法安全自动决定。
- `stale`：后续编辑使旧证据失效。

手工声明可以作为上下文显示，但不能产生 `verified`。报告会显示当前介入 ID、问题、动作、状态和证据引用，用户可以准确检查修改了什么以及循环为什么停止。

### Context、权限与解释

Context Registry 位于 loop 上游，但刻意不在权限链中：

```text
Context Pack / annotation -> Retrieval -> 建议检查或动作
Guard / Policy            -> 允许的动作和阻塞条件
Evidence                  -> 当前工作树上的验证
Intervention Ledger       -> 结果和剩余工作的解释
```

外部 Context 可以提高文件优先级、说明 API 或提出 workaround，但不能发出命令、放松 Guard、满足 contract、让 Context 变新鲜或关闭 finalize 要求。Annotation 是仓库本地、用户编写、未受信任的记忆，不是 policy。只有满足当前 evidence policy 的 command 或 CI 结果，才能把 repair 变成 `verified`。后续源代码编辑会使该结果失效并记录为 `stale`，而不是 fixed。

这一区分决定了 Desktop 的展示：报告可以说明选中了哪些文件、阻止了哪个路径或命令、建议或报告了什么修复、哪个新鲜测试验证了修复，以及哪些事项仍需人工审核。它不得把 prevention 写成 repair，也不得把建议写成 verified fix。

扩展 Harness 时，可以用 Context Pack 保存辅助领域知识，再把可执行的团队要求编码为带测试的 Guard 或 Policy 规则。自定义 Context fetcher 默认保持离线、验证 provenance 和路径，并保持相同的 Evidence 与 Intervention 状态迁移，确保自定义指导不会绕过验证。

当前实现不会直接调用 Codex、Claude Code、Cursor、OpenCode 或 MiMoCode 去改代码。它提供的是控制面：让 Agent 知道先读什么、不要改什么、改完影响谁、该跑什么、是否能结束，以及下一轮应该补上下文、补测试、修 contract 还是进入 review。

当前边界也要说清楚：它现在是 Context / Policy / Trace 报告系统 + 显式 runtime 状态机 + 有边界的 harness-led loop，不是完整自主 coding agent。Harness-led 模式可以调用 Codex / Claude Code / Cursor / OpenCode / MiMoCode 作为外部 executor，但真实代码修改仍发生在那个 executor 里；OpenCode++ 生成可验证、可排序、带证据的状态迁移、gate 结果和 decision report，由外部 Agent、用户或 CI 工作流执行后续动作。

从 Guard 模块视角看，这个 loop 由几类可靠性检查组成：

- Context Guard 决定 Agent 应该先读什么。
- Boundary Guard 决定 Agent 可以改什么、不能改什么。
- Evidence Guard 决定验证证据是否新鲜且可信。
- Impact Guard 决定哪些模块、测试和 review 面受影响。
- Loop Guard 决定 finalize、repair、repack、block 还是 require human review。

Hallucination Guard 和 Regression Guard 已经接入同一条 loop：前者检查幻觉 API、命令、配置和项目约定，后者匹配结构化 known issues / fix history / fragile modules，并在缺少 anti-regression test evidence 时阻止 finalize。

## 1. 总体执行链路

主构建链路从 CLI 进入 `buildContextPackage()`：

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

`buildContextPackage()` 是核心编排器。它加载配置，打开增量 cache，然后依次完成扫描、索引、依赖图、关键文件排序、readiness 评估、摘要和 token 节省计算。

`scanRepository()` 负责仓库事实采集：遵守 `.gitignore`，跳过依赖目录和构建产物，识别语言、框架、包管理器、入口文件、配置文件、测试命令、lint/typecheck 命令、CI、env example、migration 文件和 token 估算。这些扫描结果是后续 harness 判断的基础。

`indexRepository()` 对文件做语言分析，提取 imports、exports、symbols、routes、summary、moduleName、analysis evidence 和 confidence。TypeScript/JavaScript、Python 和 generic analyzer 通过统一 analyzer 接口接入。当前 TypeScript/JavaScript 使用 TypeScript Compiler API；Python 优先使用可选 Tree-sitter，然后回退到 Python AST 和轻量解析。

`buildDependencyGraph()` 把 import 关系转成文件级依赖边和模块级依赖边。影响分析、测试推荐、模块边界和 regression 风险都依赖这张图。

`rankFiles()` 按入口文件、配置、README/docs、导出符号、symbol 数量、依赖中心性、测试信号、分析置信度，以及 generated/lockfile/asset 惩罚给文件打分。这个分数决定 Agent 优先阅读哪些文件。

## 2. 编辑边界如何产生

编辑边界由三层机制组成：

```txt
Task Pack relevant files
  -> Task Run allowedEditGlobs / avoidEditGlobs
  -> Contracts + validateContracts()
```

### 2.1 Task Pack 先确定任务相关文件

`buildTaskPack()` 是任务上下文选择器。它先做 lexical retrieval：把任务文本拆成 terms，并匹配文件路径、模块名、summary、exports、symbols、tests、docs 和 analysis evidence。中文任务会做简单 alias 扩展，例如“登录”会扩展到 `login/auth/session/signin`，“超时”会扩展到 `timeout/expire/expiration/ttl/session`。

然后它做 graph expansion：

```txt
direct lexical hits
  -> direct imports
  -> direct importers
  -> sibling tests
  -> entrypoints
  -> config files
  -> owning module docs
  -> budget packing
```

最后按 token budget 打包成 direct source、tests、dependency neighbors、config/docs 和 entrypoints。这样 Agent 不需要先盲读全仓库，而是从一组有证据的任务相关文件开始。

### 2.2 Task Run 生成 allowed / avoid 边界

`writeTaskRun()` 是更接近 Harness 的一层。它基于 task pack 写入：

```txt
.agent-context/runs/<task-id>/
  plan.md
  pack.md
  edit-boundary.md
  expected-diff.md
  tests.md
  verify.md
  impact.md
  prompt.opencode.md
  prompt.codex.md
  prompt.claude.md
  prompt.cursor.md
  run.json
```

`allowedEditGlobsFor()` 会把 direct-source、entrypoint 和 test 类文件作为默认允许编辑范围。`avoidEditGlobsFor()` 默认避开 `dist/**`、`node_modules/**`、`.agent-context/**`、lockfile、migration/schema，以及未被任务选中的 CI、Docker、deployment 配置。

所以编辑边界不是让 LLM 猜，而是由任务相关性、文件类别、依赖图和扫描结果共同推导。

### 2.3 Contracts 把边界变成可检查约束

`buildRepoContracts()` 生成五类 contracts：

```txt
.agent-context/contracts/
  architecture.contract.json
  module-boundaries.json
  commands.contract.json
  test.contract.json
  safety.contract.json
```

`validateContracts()` 会读取这些 contracts，并针对当前 diff 检查：

- 是否修改 protected/generated paths
- lockfile 变更是否缺少 package manifest 配套变更
- 新增 env 变量是否没有更新 env example
- 架构层是否引入 forbidden import
- 模块边界是否越界
- 核心源码变更是否缺少相关测试信号

这就是“更少乱改”的主要实现基础。

## 3. 影响分析如何工作

影响分析入口是 `buildChangeImpactReport()`。它通过 `changedFilesSince(root, base)` 获取相对 base 的变化文件，底层同时考虑：

```txt
git diff --name-only <base>
git ls-files --others --exclude-standard
```

也就是已修改文件和未跟踪文件都会进入分析。

影响分析做三件事：

1. 找直接依赖者：如果 `A imports B`，当 `B` 被改动，`A` 是 direct dependent。
2. 找传递依赖者：从 direct dependents 继续向上 BFS，得到更大的调用影响面。
3. 计算风险和验证命令：结合源码变更数量、direct/transitive dependents、config/migration 变更、缺失测试、高重要性文件等信号输出 Low/Medium/High，并给出 required verification。

这让 Agent 在改完以后知道“影响谁”，而不是只看到自己改了哪些文件。

## 4. 测试推荐如何工作

测试推荐入口是 `buildTestSelection()`，支持两种常见模式：

```bash
opencode-plusplus tests . --for src/auth/session.ts
opencode-plusplus tests . --diff --base main
```

它输出三类结果：

- `minimalTests`：直接相关的最小测试。
- `recommendedRegressionTests`：受影响调用方和模块的回归测试。
- `fullConfidenceCommands`：更高置信度的全量或半全量验证命令。

最小测试主要来自：

- 目标文件本身就是测试文件
- 测试文件 import 了源文件
- 测试文件名包含源文件 basename
- 测试路径包含源文件 module dir 或 moduleName
- `src/foo` 与 `test/foo`、`tests/foo` 的路径启发式匹配

回归测试会先从依赖图里找 dependents，再找这些 dependents 的相关测试。因此它不仅推荐“被改文件附近的测试”，也会推荐“受影响调用方的测试”。

## 5. 验证报告如何工作

验证报告入口是 `renderTaskVerify()`。它综合：

- changed files
- affected modules
- missing tests
- recommended tests
- contract check
- risk score
- risk factors

它同样会读取 git diff 和 untracked files。对于 changed source files，它会根据依赖图找到 affected modules，并根据测试索引判断是否存在 missing-test signals。随后调用 `validateContracts()` 把 contract violations 一起并入验证报告。

所以 verify 不是普通 diff summary，而是：

```txt
diff + dependency impact + test gap + contract violations + risk score
```

## 6. Freshness / Drift 如何让上下文可更新

每次 `writeContextPackage()` 都会生成 `.agent-context/manifest.json`。manifest 记录：

- `generatedAt`
- `gitCommit`
- `configHash`
- `sourceHash`
- `indexHash`
- `graphHash`
- `contractsHash`
- `taskPacksHash`
- `generatedOutputHash`
- `toolVersion`
- generated files 的 hash

`assessFreshness()` 会基于当前仓库重新计算 manifest 相关 hash，并比较 source、config、index、graph、contracts、task packs 和 generated files 是否变化。如果变化，就报告 stale，并建议重新 build/update。

`assessDrift()` 更聚焦 generated-output、dependency-graph、task-pack 和 contract drift。它让 Agent 在信任 `AGENTS.md`、task packs 或 contracts 之前，先知道这些生成资产是否落后于真实代码。

`update`、`delta`、`evolve` 的产品语义需要拆开看：

- `opencode-plusplus update .`：全量刷新生成上下文，但会复用 scan/index/graph/token cache。
- `opencode-plusplus delta .`：只分析 changed context impact 和 Agent 必须重读的文件，不刷新全部输出。
- `opencode-plusplus evolve .`：当前是 cache-aware full refresh，并额外写入 `.agent-context/delta/latest.*`。它会输出复用索引文件数、重新索引文件数、graph 是否重建和 rewritten outputs。只写受影响产物的 selective write 仍是计划中能力。

## 7. Loop Controller 如何决策下一步

`buildLoopControllerReport()` 是当前最接近 Loop Engineering 的控制器。它读取：

- freshness
- drift
- contracts
- impact
- changed files
- test selection
- task pack budget
- trace evidence

然后根据 phase 输出 next decisions。支持的 phase 有：

- `preflight`
- `after-edit`
- `repair`

决策动作包括：

- `start-agent`
- `rebuild-context`
- `replan`
- `expand-context`
- `repair-contracts`
- `add-or-update-tests`
- `run-tests`
- `ready-for-review`

每个 decision 都是机器可读对象，包含 `action`、`priority`、`confidence`、`blocking`、`signals`、`reason` 和可选 `command`。这样 Agent 可以按优先级执行，也能区分“缺测试证据这类阻塞门禁”和“启动第一轮 Agent 这类非阻塞动作”。

当传入 trace id 时，controller 会读取 `.agent-context/traces/<trace-id>.json` 里的 passed test evidence。如果 changed files 已经有通过的测试证据，controller 不会继续输出 `run-tests`；只要 freshness、drift、contract、budget、impact 等信号也不阻塞，就可以进入 `ready-for-review`。

当使用 `opencode-plusplus loop "<task>" . --write` 时，controller 还会更新 `.agent-context/runs/<task-id>/state.json`。这个文件是显式 runtime 状态机，而不是普通 markdown 报告：

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

当前状态模型包括：`EMPTY`、`CONTEXT_READY`、`TASK_PACK_READY`、`EDIT_BOUNDARY_READY`、`AGENT_STARTED`、`EDITED`、`VERIFYING`、`REPAIRING`、`READY_FOR_REVIEW` 和 `BLOCKED`。它让 Agent/MCP client 能明确知道：当前在哪个状态、哪些动作允许、唯一优先下一步是什么、执行后应该产生什么证据，以及缺失证据满足后如何迁移。

典型规则如下：

```txt
freshness != fresh or drift != clean
  -> rebuild-context

taskPack.estimatedTokens > taskPack.tokenBudget
  -> replan

contracts failed
  -> repair-contracts

missing test signals
  -> add-or-update-tests

impact risk is High
  -> expand-context

changed files exist
  -> run-tests

no stale context, no violations, no changed files, no high risk
  -> ready-for-review
```

这就是从“一次性生成上下文”走向“每轮根据仓库状态决定下一步”的关键。

## 8. Execution Trace 和 Policy Engine

Loop 不能只靠生成文件，还需要记录 Agent 实际做了什么。`opencode-plusplus run "<task>" .` 会创建 task run，并生成对应 trace。也可以直接使用：

```bash
opencode-plusplus trace start "<task>" . --agent codex
opencode-plusplus trace add <trace-id> . --action edit --files src/auth/session.ts --reason "timeout logic"
opencode-plusplus trace add <trace-id> . --action run-test --command "npm test -- auth" --result passed
opencode-plusplus trace run <trace-id> . --action run-test --command "npm test -- auth"
```

trace 记录 task、agent、steps、files、reason、command、test、result、output 和 final state。证据会区分三类：

- `manual evidence`：Agent 或用户通过 `trace add` 声明某一步完成了，适合记录编辑意图和人工观察。
- `command evidence`：通过 `trace run` 由 harness 实际执行命令，记录 `exitCode`、`startedAt`、`finishedAt`、`stdoutHash`、`stderrHash`、`workingTreeHashBefore` 和 `workingTreeHashAfter`。
- `ci evidence`：来自 CI artifact 或 GitHub Action 的外部验证记录，可通过 trace step 导入。

trace step 只有通过验证后才会成为决策证据。`evidenceSatisfies()` 会检查 requirement 类型、evidence policy、required command 是否匹配、exit code 是否通过、working tree hash 是否仍等于当前可执行 diff，以及证据是否发生在最后一次编辑之后。结果会分别标记 `claimed` 与 `verified`，避免把用户或 Agent 的声明表达成系统已经验证。这样可以避免一种假闭环：Agent 先跑测试，再继续改代码，但仍复用旧的 passed test evidence。

运行时持久化用于解释和恢复，不授予能力。Context cache、source snapshot、usage、annotation、feedback、trace、report 和 intervention event 都通过带 revision 的 atomic write 保存到 `.agent-context/`。cache reuse 不会跳过 freshness、drift、policy 或 Guard 检查。状态损坏、stale lock、远程 source 不可用、Windows 权限错误和杀毒软件短暂锁定文件都会返回诊断或安全的 human-review，不会静默产生 pass。

Loop Controller、Policy Engine、Regression Guard、Guard Gate 输入和 Orchestrator 使用同一套 evidence policy：

- `advisory` 保持兼容行为，manual evidence 可以满足 requirement，但只标记为未验证声明。
- `balanced` 在修改 source/config 后要求测试至少来自 command 或 CI；非关键检查仍可使用 manual evidence。
- `strict` 要求测试和 contract validation 都来自当前 working tree 上的 command 或 CI，manual evidence 只能作为辅助信息。

为了兼容旧配置，默认值仍为 `advisory`；新 PR 工作流建议显式使用 `balanced`。CLI 可通过 `--evidence-policy` 传递，MCP runtime tool 使用同名 `evidencePolicy` 字段。

`opencode-plusplus policy . --base main --trace <trace-id>` 会把 diff、contracts、freshness 和 trace evidence 合并检查。它能阻止 forbidden edits，提示风险，并要求测试、contract validation 或 context refresh 证据。这一层让 Harness 不只是“建议”，而是具备 runtime guardrail 的形态。

`policy --fail-on` 用来控制门禁强度：

- `forbidden`：只让 forbidden edits 失败，适合本地探索。
- `required`：forbidden edits 和 missing required actions 失败，是默认值，适合 PR 检查。
- `risk`：forbidden、required 和 risk warnings 都失败，等价于 `--strict`，适合 main 分支或发布门禁。

## 9. Multi-Loop Orchestrator

`opencode-plusplus orchestrate "<task>" . --max-loops 3` 是 OpenCode++ 主导的 runtime 路径。它会重复执行：

```txt
build/refresh pack
  -> invoke executor
  -> collect diff / trace / executor events
  -> evaluate policy / impact / verify / loop
  -> decide finalize / repair / repack / block / rollback / human-review
```

每一轮都会写入独立目录：

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

`iteration.json` 是当前轮次目录的稳定索引。`executor.result.json` 记录 executor 命令、exit code、hash、变更文件和归一化事件摘要。`trace.json` 是执行 trace 的 schema wrapper，并汇总可信命令/测试证据。`guard.findings.json` 将 policy、hallucination、regression findings 统一成 `GuardFinding` schema。`guard.gates.json` 会把 Guard findings 转成阻断条件和 required actions。`decision.json` 记录最终 action、priority、confidence、blocking 状态和输入信号。

`executor.events.jsonl` 保存归一化后的 `AgentEvent` 记录。OpenCode 当前支持 `opencode run --format json` stdout、可选 transcript 文件，以及普通 stdout/stderr fallback；后续 MiMoCode、Codex、Claude Code、Cursor adapter 也会输出同一套事件模型。

Orchestrator 现在按 `Plan -> PrepareSandbox -> Execute -> Collect -> Evaluate -> Decide -> Persist -> Finalize/Continue` 的显式阶段状态机运行。每个阶段都有独立输入输出类型，executor adapter、证据收集、评估、仲裁和 artifact 持久化分别位于小型模块中。每个阶段完成后都会原子更新 `.agent-context/orchestrator/<run-id>/state.json`，其中记录 phase、iteration、已完成阶段、artifact/trace 引用、context fingerprint、working tree hash、decision、convergence 和时间戳。

中断后可使用 `--resume <run-id>` 从 `currentPhase` 继续。已完成阶段不会再次执行；trace step 使用确定性的 iteration/event 标记，重复 resume 不会重复追加 executor 或 normalized event 记录。不兼容的 schemaVersion 会直接给出明确错误。git-worktree sandbox 在成功、executor failure、阶段中断和异常路径都会清理，恢复时可从已持久化 patch 重建执行后的工作树。

当 decision 是 `repair` 或 `repack` 时，orchestrator 会进入下一轮，直到 `finalize`、`block`、`rollback`、`human-review`，或达到 `--max-loops`。`--checkpoint git-worktree` 现在会在 `.agent-context/worktrees/<run-id>/` 下为 executor 创建 git worktree sandbox，把 patch 导出到 `.agent-context/worktrees/<run-id>/diff.patch`，并把每轮 patch 镜像到 run 目录；OpenCode++ 会记录 rollback 决策和 checkpoint 证据，但不会在用户工作区自动执行破坏性回滚命令。

## 10. CLI 接入状态

当前 `src/cli/index.ts` 已经注册了主要 Harness 命令，包括：

```txt
sidecar
report
status
doctor
opencode / oc run
build
savings
rag export
trace start/add/run/show
rag search
init
graph
readiness
validate
policy
hallucination
regression
validate-contracts
freshness
drift
delta
evolve
run
loop
plan
pack
verify
task
tests
impact
orchestrate
agent run
benchmark
benchmark-agent
retrieve
diff
update
explain
```

因此这些能力不只是内部模块；它们已经通过 CLI 暴露。后续发布前仍需要继续用 npm pack --dry-run 和安装后 smoke test 确认 npm 产物包含最新 CLI、dist/ 和 LICENSE，同时确认 benchmark fixtures、agent-runs 和 .agent-context 不会进入包。

## 11. 一张闭环图

```txt
User task
  -> buildTaskPack()
     - lexical retrieval
     - symbol/export/evidence match
     - graph expansion
     - budget packing
  -> writeTaskRun()
     - plan.md
     - pack.md
     - edit-boundary.md
     - tests.md
     - impact.md
     - verify.md
     - agent prompts
  -> coding agent edits code
  -> changedFilesSince()
  -> buildChangeImpactReport()
     - direct dependents
     - transitive dependents
     - related tests
     - risk level
  -> buildTestSelection()
     - minimal tests
     - regression tests
     - full confidence commands
  -> validateContracts()
     - protected paths
     - architecture layers
     - module boundaries
     - env examples
     - lockfile pairing
     - missing tests
  -> renderTaskVerify()
     - changed files
     - affected modules
     - missing tests
     - recommended commands
     - contract check
     - risk factors
  -> buildLoopControllerReport()
     - rebuild context?
     - replan?
     - repair contracts?
     - add/update tests?
     - run tests?
     - ready for review?
```

## 11. 能力与源码机制对应

| 目标             | 代码机制                                                    | 实现原理                                                                |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| 更少瞎猜         | `buildTaskPack()` / `renderTaskPlan()` / `writeTaskRun()`   | 用任务词、symbols、exports、evidence 和依赖图选出必须先读的文件         |
| 更少乱读         | token budget + context layers                               | L0/L1/L2/L3 分层加载，不默认塞全仓库                                    |
| 更少乱改         | `allowedEditGlobsFor()` / `avoidEditGlobsFor()` / contracts | 生成允许编辑面，同时保护 generated、lockfile、migration、CI、env 等     |
| 知道影响谁       | `buildChangeImpactReport()`                                 | 从依赖图反向找 direct/transitive dependents                             |
| 知道跑什么测试   | `buildTestSelection()`                                      | 根据 diff 或目标文件找相关测试和依赖者测试                              |
| 知道是否安全结束 | `renderTaskVerify()`                                        | 综合 changed files、missing tests、contract check 和 risk score         |
| 知道下一步做什么 | `buildLoopControllerReport()`                               | 根据 freshness、drift、contracts、impact 和 tests 输出下一步 action     |
| 保持上下文新鲜   | `manifest.json` + `assessFreshness()` + `assessDrift()`     | 对 source/index/graph/contracts/task packs/generated files 做 hash 对比 |
| 留下执行证据     | `execution-trace.ts` + `policy-engine.ts`                   | 用 trace 记录 agent actions，并把验证证据纳入 policy check              |

## 12. 总结

这个项目当前的 Loop Engineering 基础是：

```txt
static repository analysis
  + task-aware context retrieval
  + dependency graph impact analysis
  + contracts
  + heuristic test recommendation
  + manifest freshness/drift
  + execution trace
  + policy engine
  + loop controller decisions
```

它不是让 Agent 自动变聪明，而是给 Agent 加了一层工程控制面：

- 读什么
- 别改什么
- 改了影响谁
- 该跑什么
- 现在能不能结束
- 下一步该修 context、修 tests、修 contract，还是进入 review

这就是 OpenCode++ 从 Context Compiler 升级成 Agent Harness Runtime 控制面的代码基础。
