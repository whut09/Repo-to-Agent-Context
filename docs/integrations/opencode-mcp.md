# OpenCode MCP Integration

[中文](opencode-mcp.zh-CN.md) | English

This guide connects OpenCode to OpenCode++ through the stdio MCP server. OpenCode remains the coding runtime; OpenCode++ supplies task context, edit boundaries, evidence checks, and repair/finalize decision reports.

## Configuration

Build the package:

```bash
npm run build
```

Add the MCP server to the OpenCode MCP configuration supported by your OpenCode version:

```json
{
  "mcpServers": {
    "opencode-plusplus": {
      "command": "opencode-plusplus-mcp",
      "args": []
    }
  }
}
```

Local development can use the built server directly:

```json
{
  "mcpServers": {
    "opencode-plusplus": {
      "command": "node",
      "args": ["path/to/opencode-plusplus/dist/mcp/server.js"]
    }
  }
}
```

## Start Loop

Ask OpenCode to call:

```txt
opencode_plusplus_start_loop
```

Example:

```json
{
  "repo": "F:/path/to/repo",
  "task": "fix login timeout bug",
  "agent": "other",
  "type": "bugfix",
  "base": "main"
}
```

The response is the runtime contract for the turn: `nextAction`, `blocking`, `requiredCommands`, `mustInspect`, `allowedEditGlobs`, `avoidEditGlobs`, and `missingEvidence`.

## Step

Record file edits:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "fix-login-timeout-bug",
  "agent": "opencode",
  "action": "edit",
  "files": ["src/auth/session.ts"],
  "reason": "Timeout handling lives in the session module"
}
```

Record command evidence:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "fix-login-timeout-bug",
  "agent": "opencode",
  "action": "run-test",
  "command": "npm test -- test/auth/session.test.ts",
  "result": "passed"
}
```

If OpenCode emits JSON events, prefer passing those events through the CLI orchestrator or future native normalizer; MCP `step` is the portable manual bridge.

## Evaluate

Call:

```txt
opencode_plusplus_evaluate
```

Example:

```json
{
  "repo": "F:/path/to/repo",
  "task": "fix login timeout bug",
  "traceId": "fix-login-timeout-bug",
  "base": "main",
  "phase": "after-edit",
  "failOn": "required"
}
```

OpenCode should treat `blocking: true` as a stop condition and follow `nextAction` plus `requiredCommands`.

## Repair

Call `opencode_plusplus_repair` when evaluation returns missing evidence, policy failures, contract failures, hallucination findings, or regression findings. Repair should focus on the returned `requiredActions` and must not widen the edit surface unless `allowedEditGlobs` changes after a repack.

## Finalize

Call `opencode_plusplus_finalize` only when the latest evaluation is non-blocking:

```json
{
  "repo": "F:/path/to/repo",
  "task": "fix login timeout bug",
  "traceId": "fix-login-timeout-bug",
  "base": "main",
  "finalState": "success"
}
```

## Limitations

- MCP mode is advisory unless your OpenCode workflow refuses to continue on `blocking: true`.
- OpenCode event schemas may differ by version; native event normalization should be validated per version.
- For OpenCode++-led execution, prefer `opencode-plusplus orchestrate ... --executor opencode`.
- MCP `step` does not execute shell commands; it records evidence provided by the agent or host.
