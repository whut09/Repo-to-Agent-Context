# OpenCode++ Documentation

This is the documentation map for OpenCode++. Start with the path that matches your role.

## Reader Paths

| I want to...                          | Read                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Try the tool in 5 minutes             | [Getting Started](getting-started.md)                                                                    |
| Understand the product positioning    | [Positioning](concepts/positioning.md)                                                                   |
| Understand the runtime architecture   | [Architecture](concepts/architecture.md)                                                                 |
| Choose Agent-led or Harness-led usage | [Integration Modes](concepts/integration-modes.md)                                                       |
| Use OpenCode chat with sidecar guards | [OpenCode Transparent Sidecar](integrations/opencode-sidecar.md)                                         |
| Use the official OpenCode Desktop     | [OpenCode Desktop 安装与使用](integrations/opencode-desktop.zh-CN.md)                                    |
| Prepare an npm release                | [Release Checklist](release.md)                                                                          |
| Use the desktop MVP shell             | [Desktop MVP](desktop.md)                                                                                |
| Integrate an executor CLI             | [Executor CLI Integration](integrations/executor-cli.md)                                                 |
| Use MCP tools                         | [MCP Tools](reference/mcp-tools.md) and [MCP Troubleshooting](integrations/mcp-troubleshooting.md)       |
| Understand generated files            | [Generated Files Policy](reference/generated-files.md) and [Artifacts Reference](reference/artifacts.md) |
| Extend or debug the runtime           | [Developer Docs](#developer-docs)                                                                        |

## Concepts

- [Positioning](concepts/positioning.md): why this is a reliability layer, not another coding agent.
- [Architecture](concepts/architecture.md): scanner, indexer, graph, guards, runtime, integrations.
- [Guard Modules](concepts/guard-modules.md): Context, Boundary, Evidence, Impact, Hallucination, Regression, Loop.
- [Integration Modes](concepts/integration-modes.md): Agent-led vs Harness-led entry points.
- [Loop Engineering](concepts/loop-engineering.md): source-level walkthrough of the loop path.

Chinese concept pages:

- [Guard Modules 中文](concepts/guard-modules.zh-CN.md)
- [两套集成模式](concepts/integration-modes.zh-CN.md)
- [Loop Engineering 源码链路](concepts/loop-engineering.zh-CN.md)

## Reference

- [CLI Reference](reference/cli-reference.md)
- [CLI Help Snapshot](reference/cli-help-snapshot.md)
- [MCP Tools](reference/mcp-tools.md)
- [Generated Files and Commit Policy](reference/generated-files.md)
- [Artifacts](reference/artifacts.md)
- [Configuration](reference/config.md)
- [Executor Adapters](reference/executor-adapters.md)
- [Retrieval Providers](reference/retrieval.md)
- [Release Checklist](release.md)

## Integrations

- [Desktop MVP](desktop.md)
- [Codex MCP](integrations/codex-mcp.md)
- [Claude Code MCP](integrations/claude-code-mcp.md)
- [Cursor MCP](integrations/cursor-mcp.md)
- [OpenCode Transparent Sidecar](integrations/opencode-sidecar.md)
- [OpenCode Desktop 安装与使用](integrations/opencode-desktop.zh-CN.md)
- [OpenCode MCP](integrations/opencode-mcp.md)
- [Executor CLI](integrations/executor-cli.md)
- [MCP Troubleshooting](integrations/mcp-troubleshooting.md)

## Developer Docs

- [Source Walkthrough](developer/source-walkthrough.md)
- [Runtime State Machine](developer/runtime-state-machine.md)
- [Guard Gate Schema](developer/guard-gate-schema.md)
- [Benchmark Guide](developer/benchmark-guide.md)

## Roadmap

- [Roadmap](roadmap.md)
- [Roadmap 中文](roadmap.zh-CN.md)
