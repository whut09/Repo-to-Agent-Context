# Benchmark 指南

[English](benchmark-guide.md) | 中文

Benchmark 分为两层，不能把两层合并成一个成功率。

## A. 快速确定性层

每个 PR/CI 运行，不调用付费 Agent：

```powershell
npm run benchmark
npm run benchmark:agent
```

它验证 fixture 的 retrieval、边界、证据、regression memory、decision 和 loop wiring。benchmark:agent 使用 mock，并标记为 deterministic-proxy；它不能证明真实 Agent 的成功增量、成本、token 或收敛。

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
