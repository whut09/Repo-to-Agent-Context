# Benchmark 指南

[English](benchmark-guide.md) | 中文

Benchmark 分为两层，不能把两层合并成一个成功率。

## A. 快速确定性层

每个 PR/CI 运行，不调用付费 Agent：

```powershell
npm run benchmark
npm run benchmark:agent
npm run benchmark:explainability
```

它验证 fixture 的 retrieval、边界、证据、regression memory、decision 和 loop wiring。benchmark:agent 使用 mock，并标记为 deterministic-proxy；它不能证明真实 Agent 的成功增量、成本、token 或收敛。

### Context 可解释性 Benchmark

`benchmark:explainability` 使用 6 个确定性 fixture 场景运行 Context Registry、retrieval service、Context fetch/cache、freshness status 和 Intervention Ledger：

- 正常检索与当前 command evidence；
- 相似但无关文件；
- 工作树编辑后的 stale Context；
- 错误的本地 annotation；
- 外部 Context 中包含错误命令的建议；
- 测试成功后再次编辑代码。

通过 package script 运行时，报告写入 `benchmarks/results/context-explainability/result.json` 和 `result.md`。每个样本记录 task type、fixture、source、package version、content revision、prompt hash、fixture commit、selected/rejected 文件、Context selected/omitted 文件、缓存/freshness、retrieval score breakdown、intervention event、预期/最终 decision 和指标值。

报告包括 Precision@K、Recall@K、selected/rejected 文件准确率、Context cache hit rate、fetch duration、stale 检测率、intervention 检测准确率、verified-fix precision、false-fixed rate、unresolved blocker recall、human-review rate、最终决策准确率和 token savings。每个指标都包含样本数、均值、中位数、样本标准差和 95% 置信区间。阻止风险或 human review 绝不能计为 verified fix。

具有适用条件的指标只统计符合条件的样本。stale 检测只统计 stale Context 和测试成功后再次编辑的场景。verified-fix precision 与 false-fixed rate 只统计终态仍声明为 `verified` 的介入；后续 `stale` 事件会取代旧验证。unresolved blocker recall 只统计负向阻塞场景。因此不同指标的 `N` 会不同，解释均值或置信区间时必须同时查看该列。

## B. 真实 executor 层

通过手动 workflow 或 nightly workflow 运行，禁止使用 mock：

```powershell
npm run benchmark:agent:real -- --executor codex --executor-command "codex exec --prompt-file {prompt}" --repetitions 3 --seeds 11,22,33
```

支持 OpenCode、Codex CLI、Claude Code、MiMoCode 和 Cursor 的 generic adapter。报告保存 executor/model/version、prompt hash、repo commit、seed、配置、token、成本、时间、命令数、循环数和人工介入率。

报告应给出样本数、均值、中位数、标准差和置信区间，分别报告 final success、test pass、decision accuracy、convergence、wrong-file、forbidden-edit、hallucinated-command、no-progress、human-review、token/cost/time、Recall@K 和 Precision@K。缺失 token 不得转换成 0。

## 基线和回归

只能比较相同 executor、model、prompt、任务集和配置的真实报告。mock proxy 与 real executor 不得混在一个总体结论中。高 Precision@8 和 regression Recall 的优化应通过符号相关性、调用链权重、regression memory、task-type Top-K 和 negative examples 验证。

CI 只运行快速层。真实层的命令只能来自 CI secrets，报告只保存 command hash，不保存密钥和完整命令。

确定性 JSON 报告包含 `summary.sampleCount`、`summary.elapsedMs`，每个检索命中还包含评分分解。Precision 表示 Top-K 槽位中预期相关文件的比例，Recall 表示 Top-K 找到的预期相关文件比例。缓存可以报告为 reused、incremental 或 rebuilt，但插件使用 context 前仍会执行 freshness 和 drift 检查。

Desktop 检索按任务类型选择默认 Top-K：bugfix 为 6，feature 为 8，refactor 为 10，auto 为 8。插件同时报告 selected/rejected 文件，便于定位 Precision@K 偏低的具体原因。显式负例会被强降权，但任务明确指定该路径时不会误伤。

Desktop 的 `prepare`、`retrieve` 和 `evaluate` 都返回结构化 `performance`，包括阶段、目标耗时、实际耗时、缓存状态、context 模式、selected 文件和 rejected 文件。超时返回 `ok: false` 与 `error.code: HARNESS_ERROR`，不会伪造验证策略失败结论。
