# Cursor MCP 集成

[English](cursor-mcp.md) | 中文

Cursor 通过 MCP 作为 Agent-led client 使用 OpenCode++。Cursor 负责聊天、工具调用和编辑；OpenCode++ 负责仓库 context、边界、证据、影响和验证报告。

Windows 约束：

- 使用 stdio MCP 配置，路径使用 Windows 绝对路径或明确的工作目录；
- 保护 package.json、lockfile、配置、CI 和生成目录时遵守返回的 allowed/avoid 边界；
- command evidence 应由 trace run 或宿主捕获，不要只写手工声明；
- strict evidence policy 下 manual evidence 不能关闭 blocking requirement。

完整参数和示例见 [Cursor MCP](cursor-mcp.md)。
