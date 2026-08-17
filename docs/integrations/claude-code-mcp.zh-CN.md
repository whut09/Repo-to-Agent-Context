# Claude Code MCP 集成

[English](claude-code-mcp.md) | 中文

Claude Code 作为 MCP client 调用 OpenCode++ 时，外部 Agent 仍拥有编辑和命令执行权，OpenCode++ 返回 context、边界、evidence、policy 和 decision。推荐先执行 build/plan/pack，再在编辑后调用 tests、impact、verify 和 policy。

## Windows 配置原则

- MCP server 使用 stdio，不需要启动 Desktop GUI；
- 配置文件中不要写 API key，凭据放在本机环境；
- 仓库运行状态写入目标仓库 .agent-context；
- Guard 在 Agent-led 模式默认是建议，Claude Code 必须遵守 blocking 结果；
- 需要 OpenCode++ 持有循环时使用 CLI Harness，而不是把 MCP 工具误认为自动执行器。

详细英文示例见 [Claude Code MCP](claude-code-mcp.md)。
