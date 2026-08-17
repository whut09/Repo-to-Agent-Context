# Codex MCP 集成

[English](codex-mcp.md) | 中文

Codex 可以通过 stdio MCP 调用 OpenCode++ 的 context、task、retrieval、tests、impact、verify、policy 和 loop 工具。Codex 仍是实际编辑者；Agent-led 模式的 gate 默认是建议，必须让 Codex 在下一次动作前读取 blocking、requiredCommands、allowedEditGlobs 和 missingEvidence。

Windows 上推荐：

1. 在目标仓库生成 .agent-context；
2. 让 Codex 调用 plan/pack；
3. 编辑后记录 command evidence；
4. 调用 verify 和 policy；
5. 只有 required gate 清零后再 finalize。

不要把 opencode-plusplus.local.yml 或密钥提交进仓库。完整配置见 [Codex MCP](codex-mcp.md)。
