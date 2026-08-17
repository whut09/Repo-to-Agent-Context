# Guard Gate Schema

[English](guard-gate-schema.md) | 中文

Harness 每轮把 policy、hallucination、regression、boundary 和 evidence 结果规范化为 GuardFinding 与 GuardGate，写入：

```text
.agent-context/runs/<task-id>/iterations/<nnn>/guard.findings.json
.agent-context/runs/<task-id>/iterations/<nnn>/guard.gates.json
.agent-context/runs/<task-id>/iterations/<nnn>/decision.json
```

Finding 至少包括 id、source、kind、status、severity、message、evidence 和 requiredCommands。Gate 至少包括 id、guard、blocking、action、evidence 和 findingIds。

所有 gate、executor failure、policy forbidden、loop 信号先转换为 DecisionCandidate，再统一排序和归并。优先级为：

```text
rollback > block > repack > repair > run-tests > human-review > finalize
```

最高优先级是 selected candidate，其余候选保留为 supporting candidates。reasons、requiredCommands、artifacts 做稳定去重，数组输入顺序不能改变最终 decision。报告必须保留 selected candidate、priority 和 suppressed/supporting candidates。
