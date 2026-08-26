# MCP 工具参考

[English](mcp-tools.md) | 中文

MCP server 通过 stdio 暴露 OpenCode++。基础工具包括 build、plan、pack、retrieve、tests、impact、verify 和 explain；实验 runtime 工具包括 start_loop、step、evaluate、repair 和 finalize。

## Context 兼容工具

- `opencode_plusplus_context_search`
- `opencode_plusplus_context_get`
- `opencode_plusplus_context_status`
- `opencode_plusplus_interventions`
- `opencode_plusplus_context_feedback`

这些工具只面向开发者和兼容集成，与 OpenCode Desktop 插件调用相同的 application service；不会启动 CLI 子进程，也不会调用模型。

`context_search` 支持 exact/fuzzy query，以及 `topK`、`taskType`、`language`、`packageVersion`、`source` 和 `tags` 过滤。结果包含确定性 score 和 score breakdown。`context_get` 支持 `entryId`、`language`、`packageVersion`、`source`、`file`、`full` 和 `withAnnotations`。

`context_status` 返回 registry source、缓存、当前工作树 freshness、已选/拒绝 Context 和当前介入摘要。`interventions` 要求提供 `taskId`，返回 ledger event 和状态汇总。

4 个只读工具使用统一 envelope：

```json
{
  "schemaVersion": "opencode-plusplus.context-tools.v1",
  "ok": true,
  "tool": "context-search",
  "data": {}
}
```

失败时 `ok` 为 `false`，并返回稳定的 `error.code`、`message`、`details` 和 `retryable`。路径穿越、非法参数、未知 entry、source 不可用、网络失败、registry 非法和 state 损坏都会作为结构化错误返回。

外部 Context 和 annotation 只是不受信任的建议，不能授权命令、关闭 blocker，也不能满足测试、contract、freshness、forbidden path 或 finalize evidence。

Runtime 返回结构化字段：nextAction、blocking、requiredCommands、mustInspect、allowedEditGlobs、avoidEditGlobs 和 missingEvidence。Agent-led 模式下外部 Agent 仍负责实际执行和遵守 gate；MCP 不会自动替用户编辑代码。

Windows 上确认 Node.js 20+、MCP client 的工作目录和仓库路径。需要 OpenCode++ 持有多轮循环时使用 CLI orchestrate/Harness-led，而不是只调用单个 MCP 工具。

MCP 是开发者兼容入口。普通 OpenCode Desktop 用户应下载 Release EXE，并在 Desktop 中选择 OpenCode++ 模式。
