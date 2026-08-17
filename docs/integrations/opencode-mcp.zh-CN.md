# OpenCode MCP 集成

[English](opencode-mcp.md) | 中文

OpenCode MCP 有两种边界：官方 Desktop 通过全局插件接入，批处理或其他客户端通过 stdio MCP server 接入。两者共享领域逻辑，但 MCP server 不提供 Desktop UI，也不负责安装全局插件。

## Agent-led

外部 OpenCode/Agent 调用 plan、pack、retrieve、tests、impact、verify、evaluate、repair 和 finalize。返回值包含 nextAction、blocking、requiredCommands、mustInspect、allowedEditGlobs、avoidEditGlobs 和 missingEvidence。外部 Agent 负责遵循这些结果。

## Harness-led

需要 OpenCode++ 持有循环时使用 CLI orchestrate 或 opencode preset。它调用外部 executor，写 iteration artifact，执行 Guard Gate 仲裁、收敛检测和 human-review。

## Windows 注意事项

- MCP server 使用 Node.js 20+ 和 stdio；
- 本地凭据只放环境或 local config；
- 路径应使用 Windows 绝对路径，避免 shell 控制符；
- Desktop 插件安装、启用和卸载见 [Windows 安装与使用](opencode-desktop.zh-CN.md)。
