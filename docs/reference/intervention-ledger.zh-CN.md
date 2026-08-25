# Intervention Ledger 参考

[English](intervention-ledger.md) | 中文

Intervention Ledger 是 Harness 对 finding 和介入动作的本地追加记录。它使用现有 atomic JSON store 写入 `.agent-context/interventions/<task-id>.json`。这些运行时文件只保存在本地，不能提交到 Git 或打进发布包。

## 事件契约

每条事件包含稳定的 `interventionId` 和幂等的 `eventId`，以及任务/会话身份、阶段、类别、finding、目标文件、动作、前后状态、证据引用、状态、可信度和来源。可选的 trace 与 decision 引用支持反查。

## 验证边界

只有当前 working tree 上有效、由 command 或 CI 捕获的证据，才能把介入状态迁移到 `verified`。手工证据可以显示，但不能关闭 blocking requirement。后续编辑会使旧证据变为 `stale`，不能继续显示为已修复。

## 恢复

并发追加使用共享文件锁和 atomic store。重复 event ID 会被忽略。损坏 JSON、不支持的 schemaVersion 和非法状态迁移都会返回可诊断错误，不会静默变成空 Ledger。
