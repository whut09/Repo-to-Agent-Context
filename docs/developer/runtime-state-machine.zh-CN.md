# 运行时状态机

[English](runtime-state-machine.md) | 中文

## 两种状态

Agent-led 状态写入 .agent-context/runs/<task-id>/state.json，记录 context、task、diff、evidence 和下一步动作。Harness-led Orchestrator 另写 .agent-context/orchestrator/<run-id>/state.json，记录 schemaVersion、phase、iteration、artifact references、trace、context fingerprint、working-tree hash、latest decision、convergence 和时间戳。

## 阶段迁移

```text
Plan -> PrepareSandbox -> Execute -> Collect -> Evaluate -> Decide -> Persist -> Finalize 或 Continue
```

每个阶段成功后原子持久化。resume <run-id> 从 currentPhase 恢复，已完成阶段不重复执行。未知 schemaVersion 必须明确报错，不能猜测兼容。

## 收敛

每轮 fingerprint 包含 working-tree hash、decision action、blocking finding/gate IDs、missing evidence、required commands、context freshness/drift。数组先去重排序后 hash，因此数组原始顺序不影响结果。

- progressing：允许下一轮；
- terminal：finalize、block、rollback 或 human-review 已终止；
- executor-failure：executor 失败或退出码未知；
- repeated-state：连续两轮阻塞 fingerprint 相同，转 human-review/no-progress；
- max-loops-reached：循环预算用尽，不能误报为 repeated-state。

## Sandbox

git-worktree sandbox 在准备成功、executor 失败、阶段异常、正常结束和 resume 后都必须清理。回滚记录 patch 和 decision，不对用户工作树自动执行破坏性命令。
