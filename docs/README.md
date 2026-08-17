# OpenCode++ Documentation

[中文目录](README.zh-CN.md) | English

OpenCode++ is Windows-first: install the plugin for the official OpenCode Desktop with the release EXE, then use status, enable, and disable from the chat UI. CLI and MCP are advanced automation surfaces, not a second Desktop application.

## Start Here

| Goal                                               | Document                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Install, upgrade, disable, or uninstall on Windows | [OpenCode Desktop on Windows](integrations/opencode-desktop.md)                       |
| Understand the plugin and its hard boundaries      | [Windows plugin architecture and boundaries](concepts/windows-plugin-architecture.md) |
| Start in five minutes                              | [Getting Started](getting-started.md)                                                 |
| Understand the global event-driven runtime         | [OpenCode Global Sidecar](integrations/opencode-sidecar.md)                           |
| Understand context, guards, evidence, and loops    | [Architecture](concepts/architecture.md)                                              |
| Choose agent-led or harness-led usage              | [Integration Modes](concepts/integration-modes.md)                                    |
| Operate the CLI                                    | [CLI Reference](reference/cli-reference.md)                                           |
| Configure evidence trust                           | [Configuration](reference/config.md)                                                  |
| Build and publish releases                         | [Release Checklist](release.md)                                                       |

## Concepts

- [Positioning](concepts/positioning.md)
- [Windows Plugin Architecture](concepts/windows-plugin-architecture.md)
- [Architecture](concepts/architecture.md)
- [Guard Modules](concepts/guard-modules.md)
- [Integration Modes](concepts/integration-modes.md)
- [Loop Engineering](concepts/loop-engineering.md)

## Windows and Integrations

- [OpenCode Desktop on Windows](integrations/opencode-desktop.md)
- [OpenCode Global Sidecar](integrations/opencode-sidecar.md)
- [OpenCode MCP](integrations/opencode-mcp.md)
- [Codex MCP](integrations/codex-mcp.md)
- [Claude Code MCP](integrations/claude-code-mcp.md)
- [Cursor MCP](integrations/cursor-mcp.md)
- [Executor CLI](integrations/executor-cli.md)
- [MCP Troubleshooting](integrations/mcp-troubleshooting.md)

## Developer Documentation

- [Source Walkthrough](developer/source-walkthrough.md)
- [Runtime State Machine](developer/runtime-state-machine.md)
- [Guard Gate Schema](developer/guard-gate-schema.md)
- [Benchmark Guide](developer/benchmark-guide.md)

## Reference

- [CLI Reference](reference/cli-reference.md)
- [CLI Help Snapshot](reference/cli-help-snapshot.md)
- [MCP Tools](reference/mcp-tools.md)
- [Configuration](reference/config.md)
- [Artifacts](reference/artifacts.md)
- [Generated Files](reference/generated-files.md)
- [Executor Adapters](reference/executor-adapters.md)
- [Retrieval Providers](reference/retrieval.md)
- [Release Checklist](release.md)
- [Roadmap](roadmap.md)

Each maintained English page has a Chinese page next to it with the .zh-CN.md suffix. The CLI help snapshot is generated canonical output; the Chinese CLI reference explains the same command groups and links to that snapshot.
