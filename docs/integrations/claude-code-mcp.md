# Claude Code MCP Integration

[中文](claude-code-mcp.zh-CN.md) | English

This guide connects Claude Code to OpenCode++ as an MCP reliability backend. Claude Code performs code edits; OpenCode++ returns repository context, boundaries, evidence requirements, and loop decision reports.

## Configuration

Build the package:

```bash
npm run build
```

Configure a stdio MCP server in the Claude Code MCP settings used by your environment:

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

For repository-local development:

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
  "task": "add SSO login",
  "agent": "claude-code",
  "type": "feature",
  "base": "main"
}
```

Claude Code should load the returned `mustInspect` files first, follow `allowedEditGlobs`, avoid `avoidEditGlobs`, and keep `traceId` for subsequent calls.

## Step

Record edits:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "add-sso-login",
  "agent": "claude-code",
  "action": "edit",
  "files": ["src/auth/sso.ts"],
  "reason": "Added SSO provider flow"
}
```

Record test evidence:

```json
{
  "repo": "F:/path/to/repo",
  "traceId": "add-sso-login",
  "agent": "claude-code",
  "action": "run-test",
  "command": "npm test -- auth",
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
  "task": "add SSO login",
  "traceId": "add-sso-login",
  "base": "main",
  "phase": "after-edit",
  "failOn": "required"
}
```

The important fields are `blocking`, `nextAction`, `requiredCommands`, `missingEvidence`, and `policy`. If `blocking` is true, Claude Code should repair or gather evidence before summarizing completion.

## Repair

Call `opencode_plusplus_repair` after a blocked evaluation. Use the returned `requiredActions` as the repair prompt. If the issue is missing context or high impact, ask OpenCode++ to repack or expand context before editing more files.

## Finalize

Call:

```txt
opencode_plusplus_finalize
```

Example:

```json
{
  "repo": "F:/path/to/repo",
  "task": "add SSO login",
  "traceId": "add-sso-login",
  "base": "main",
  "finalState": "success"
}
```

Only report the task as ready when `passed` is true and `blocking` is false.

## Limitations

- Claude Code can ignore advisory tool output unless your workflow treats `blocking` as mandatory.
- `CLAUDE.md` and `AGENTS.md` may both exist; OpenCode++ task runs are the source of task-specific boundaries and evidence.
- MCP `step` records actions but does not prove a command ran unless the host captures command evidence.
- End-to-end Claude Code behavior should be validated per client release.
