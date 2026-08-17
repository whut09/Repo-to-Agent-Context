# Cursor MCP Integration

[中文](cursor-mcp.zh-CN.md) | English

This guide connects Cursor to OpenCode++ through the stdio MCP server. Cursor remains the editor and coding agent; OpenCode++ provides task-aware context, edit boundaries, evidence gates, and loop decision reports.

## Configuration

Build the package:

```bash
npm run build
```

Add the MCP server to Cursor's MCP configuration:

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

For local development:

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

Call:

```txt
opencode_plusplus_start_loop
```

Example:

```json
{
  "repo": "F:/path/to/repo",
  "task": "refactor auth session module",
  "agent": "cursor",
  "type": "refactor",
  "base": "main"
}
```

Cursor should pin the returned `mustInspect`, `allowedEditGlobs`, `avoidEditGlobs`, and `requiredCommands` into the active task context.

## Step

Record edits:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "refactor-auth-session-module",
  "agent": "cursor",
  "action": "edit",
  "files": ["src/auth/session.ts", "test/auth/session.test.ts"],
  "reason": "Split timeout behavior and updated related tests"
}
```

Record verification:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "refactor-auth-session-module",
  "agent": "cursor",
  "action": "run-test",
  "command": "npm test -- test/auth/session.test.ts",
  "result": "passed"
}
```

## Evaluate

Call:

```txt
opencode_plusplus_evaluate
```

Example:

```json
{
  "repo": "F:/path/to/repo",
  "task": "refactor auth session module",
  "traceId": "refactor-auth-session-module",
  "base": "main",
  "phase": "after-edit",
  "failOn": "required"
}
```

Cursor should surface `blocking`, `nextAction`, `requiredCommands`, `missingEvidence`, and `allowedEditGlobs` to the user before closing the task.

## Repair

Call `opencode_plusplus_repair` when evaluation blocks. Use `requiredActions` as the repair checklist and avoid expanding edits outside `allowedEditGlobs` unless the next action is repack or expand-context.

## Finalize

Call:

```txt
opencode_plusplus_finalize
```

Example:

```json
{
  "repo": "F:/path/to/repo",
  "task": "refactor auth session module",
  "traceId": "refactor-auth-session-module",
  "base": "main",
  "finalState": "success"
}
```

`passed: true` plus `blocking: false` is the signal that OpenCode++ considers the task ready for review.

## Limitations

- Cursor rules, AGENTS.md, and MCP results can overlap; the task run returned by `start_loop` should be treated as the task-specific source of truth.
- MCP mode cannot force Cursor to run commands or obey gates without host workflow support.
- Cursor MCP configuration and tool invocation UX may vary by Cursor version.
- For strict enforcement, use the CLI orchestrator with an executor instead of agent-led MCP mode.
