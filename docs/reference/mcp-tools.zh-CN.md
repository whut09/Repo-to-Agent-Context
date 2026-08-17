# MCP 工具参考

[English](mcp-tools.md) | 中文

MCP server 通过 stdio 暴露 OpenCode++。基础工具包括 build、plan、pack、retrieve、tests、impact、verify 和 explain；实验 runtime 工具包括 start_loop、step、evaluate、repair 和 finalize。

Runtime 返回结构化字段：nextAction、blocking、requiredCommands、mustInspect、allowedEditGlobs、avoidEditGlobs 和 missingEvidence。Agent-led 模式下外部 Agent 仍负责实际执行和遵守 gate；MCP 不会自动替用户编辑代码。

Windows 上确认 Node.js 20+、MCP client 的工作目录和仓库路径。需要 OpenCode++ 持有多轮循环时使用 CLI orchestrate/Harness-led，而不是只调用单个 MCP 工具。
