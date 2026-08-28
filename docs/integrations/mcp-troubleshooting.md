# MCP Troubleshooting

[中文](mcp-troubleshooting.zh-CN.md) | English

## Server Does Not Start

Check that the package is built:

```bash
npm run build
node dist/mcp/server.js
```

For a developer npm installation, use:

```bash
opencode-plusplus-mcp
```

## Client Cannot Find Tools

Confirm that the client is configured for a stdio MCP server and points to `opencode-plusplus-mcp` or `node dist/mcp/server.js`.

This troubleshooting page applies to developer or compatibility integrations. It does not install or enable the OpenCode Desktop plugin. For normal Desktop use, install the Windows EXE, restart OpenCode, and select the `OpenCode++` primary mode.

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
