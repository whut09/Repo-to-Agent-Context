# Codex MCP Integration

[中文](codex-mcp.zh-CN.md) | English

This guide wires OpenCode++ into Codex through the stdio MCP server. The MCP flow is agent-led: Codex edits code, while OpenCode++ returns context, edit boundaries, evidence requirements, and loop decision reports.

## Configuration

Build the package first:

```bash
npm run build
```

Register the MCP server in the Codex MCP configuration used by your environment:

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

For local development without a global install, point Codex at the built server:

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

Ask Codex to call:

```txt
opencode_plusplus_start_loop
```

Example arguments:

```json
{
  "repo": "F:/path/to/repo",
  "task": "fix login timeout bug",
  "agent": "codex",
  "type": "bugfix",
  "base": "main"
}
```

The response includes `traceId`, `nextAction`, `blocking`, `requiredCommands`, `mustInspect`, `allowedEditGlobs`, `avoidEditGlobs`, and `missingEvidence`. Codex should inspect `mustInspect` before editing and keep edits inside `allowedEditGlobs`.

## Step

Record edits:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "fix-login-timeout-bug",
  "agent": "codex",
  "action": "edit",
  "files": ["src/auth/session.ts"],
  "reason": "Adjusted timeout refresh logic"
}
```

Record tests or verification:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "fix-login-timeout-bug",
  "agent": "codex",
  "action": "run-test",
  "command": "npm test -- test/auth/session.test.ts",
  "result": "passed"
}
```

Prefer command evidence over manual claims. Command evidence lets the policy layer validate exit code, timestamps, and working-tree hashes.

## Evaluate

After edits, call:

```txt
opencode_plusplus_evaluate
```

Use:

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

Read `blocking`, `nextAction`, `requiredCommands`, and `missingEvidence` first. If `blocking` is true, Codex should not claim the task is done.

## Repair

When evaluation blocks, call:

```txt
opencode_plusplus_repair
```

The response returns `requiredActions`, `requiredCommands`, `mustInspect`, and the loop report. Codex should repair only the blocked findings and then call `step` plus `evaluate` again.

## Finalize

Call:

```txt
opencode_plusplus_finalize
```

Use it only after tests, contracts, policy, and evidence are satisfied:

```json
{
  "repo": "F:/path/to/repo",
  "task": "fix login timeout bug",
  "traceId": "fix-login-timeout-bug",
  "base": "main",
  "finalState": "success"
}
```

`passed: true` and `blocking: false` mean OpenCode++ considers the loop ready for review.

## Limitations

- Codex remains the executor. MCP tools cannot force Codex to obey a gate unless your workflow treats `blocking: true` as a hard stop.
- Client-specific MCP configuration can vary by Codex runtime version.
- The MCP server does not replace `opencode-plusplus orchestrate`; harness-led execution still belongs to the CLI orchestrator.
- Evidence is strongest when recorded from real command steps, not natural-language summaries.
