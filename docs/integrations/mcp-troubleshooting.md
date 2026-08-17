# MCP Troubleshooting

[中文](mcp-troubleshooting.zh-CN.md) | English

## Server Does Not Start

Check that the package is built:

```bash
npm run build
node dist/mcp/server.js
```

If installed from npm, use:

```bash
opencode-plusplus-mcp
```

## Client Cannot Find Tools

Confirm that the client is configured for a stdio MCP server and points to `opencode-plusplus-mcp` or `node dist/mcp/server.js`.

## Runtime Tools Look Advisory

That is expected for Agent-led MCP mode. The host agent still decides whether to obey the returned gates. For OpenCode++ to evaluate gates after executor output, use the harness-led CLI path:

```bash
opencode-plusplus orchestrate "<task>" . --executor mock --max-loops 3
```

## Missing Evidence

Use command-captured trace evidence:

```bash
opencode-plusplus trace run <trace-id> . --action run-test --command "npm test"
```

Manual evidence is useful for notes, but command evidence includes exit code, timestamps, output hashes, and working-tree hashes.
