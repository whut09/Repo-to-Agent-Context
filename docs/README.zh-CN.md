# OpenCode++ 文档目录

[English index](README.md) | 中文

OpenCode++ 当前以 Windows 为重点：使用 Release EXE 把插件安装到官方 OpenCode Desktop，然后在聊天界面中查看状态、启用和关闭。CLI 与 MCP 是内部 dev/test 兼容面，不是用户路径，也不是第二个 Desktop 应用。

## 从这里开始

| 目标                                  | 文档                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Windows 安装、升级、关闭、卸载        | [Windows 安装与使用](integrations/opencode-desktop.zh-CN.md)            |
| 理解插件原理和硬边界                  | [Windows 插件架构与边界](concepts/windows-plugin-architecture.zh-CN.md) |
| 理解产品边界（CLI/MCP 内部定位）      | [产品边界说明](developer/product-boundary.zh-CN.md)                     |
| 五分钟开始                            | [快速开始](getting-started.zh-CN.md)                                    |
| 理解事件驱动运行时                    | [OpenCode 全局 Sidecar](integrations/opencode-sidecar.zh-CN.md)         |
| 理解 context、guard、evidence 和 loop | [总体架构](concepts/architecture.zh-CN.md)                              |
| 选择 Agent-led 或 Harness-led         | [集成模式](concepts/integration-modes.zh-CN.md)                         |
| 使用 CLI（开发者面）                  | [CLI 参考](reference/cli-reference.zh-CN.md)                            |
| 配置证据可信等级                      | [配置参考](reference/config.zh-CN.md)                                   |
| 构建和发布                            | [发布检查](release.zh-CN.md)                                            |

## 原理和开发

- [产品边界说明](developer/product-boundary.zh-CN.md)
- [产品定位](concepts/positioning.zh-CN.md)
- [Windows 插件架构](concepts/windows-plugin-architecture.zh-CN.md)
- [总体架构](concepts/architecture.zh-CN.md)
- [Guard 模块](concepts/guard-modules.zh-CN.md)
- [集成模式](concepts/integration-modes.zh-CN.md)
- [Loop Engineering](concepts/loop-engineering.zh-CN.md)
- [源码导读](developer/source-walkthrough.zh-CN.md)
- [运行时状态机](developer/runtime-state-machine.zh-CN.md)
- [Guard Gate Schema](developer/guard-gate-schema.zh-CN.md)
- [Benchmark 指南](developer/benchmark-guide.zh-CN.md)

## 集成和参考

- [OpenCode MCP](integrations/opencode-mcp.zh-CN.md)
- [Codex MCP](integrations/codex-mcp.zh-CN.md)
- [Claude Code MCP](integrations/claude-code-mcp.zh-CN.md)
- [Cursor MCP](integrations/cursor-mcp.zh-CN.md)
- [Executor CLI](integrations/executor-cli.zh-CN.md)
- [MCP 排障](integrations/mcp-troubleshooting.zh-CN.md)
- [MCP 工具](reference/mcp-tools.zh-CN.md)
- [配置参考](reference/config.zh-CN.md)
- [Artifact](reference/artifacts.zh-CN.md)
- [生成文件策略](reference/generated-files.zh-CN.md)
- [Executor Adapter](reference/executor-adapters.zh-CN.md)
- [Retrieval](reference/retrieval.zh-CN.md)
- [Roadmap](roadmap.zh-CN.md)

每个英文人工维护页旁边都有 .zh-CN.md 中文页。CLI help snapshot 是机器生成的规范输出，中文 CLI 参考说明相同命令组并链接到该快照。
