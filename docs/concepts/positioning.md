# Positioning

[中文](positioning.zh-CN.md) | English

OpenCode++ is an **external reliability harness for OpenCode**.

OpenCode++ is not affiliated with, endorsed by, or built by the OpenCode team. OpenCode remains the coding agent runtime; OpenCode++ adds context, edit boundaries, execution evidence, policy gates, impact analysis, and repair/finalize decision reports around the OpenCode workflow.

The runtime product is the Windows plugin for the official OpenCode Desktop, installed from the release EXE. The same harness primitives can also be driven from Codex, Claude Code, Cursor, and MiMoCode through the internal CLI or MCP compatibility surfaces, but those are developer paths, not user paths.

```txt
User task
  -> context and boundary preparation
  -> external code-agent executor
  -> diff / trace / test evidence collection
  -> guard evaluation
  -> decision report
```

## What It Owns

- Repository context compilation.
- Task-aware file retrieval and context packing.
- Edit boundaries and protected paths.
- Trace and command evidence recording.
- Policy, contracts, tests, impact, hallucination, and regression gates.
- Repair / repack / finalize / block / human-review decision reports.

## What It Does Not Own

- Model provider login.
- Interactive coding-agent UI.
- General tool-calling runtime.
- Actual source edits unless a configured external executor performs them.
- Automatic merge decisions.

## Integration Modes

The Desktop plugin is the product entry point. The agent-led and harness-led modes below are developer/automation surfaces reached through the internal CLI or MCP, not user installation paths.

- Desktop sidecar: OpenCode hosts the plugin; it observes the session, guards commands/paths, records evidence, and runs in-process harness tools.
- Agent-led mode: The external code agent calls OpenCode++ CLI or MCP tools. Gates are advisory unless the host agent follows them.
- Harness-led mode: OpenCode++ invokes a configured executor, collects evidence, evaluates gates, and writes decision reports.

See [Integration Modes](integration-modes.md) and [Product Boundary](../developer/product-boundary.md).
