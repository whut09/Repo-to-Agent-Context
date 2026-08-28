# MCP Tools

[中文](mcp-tools.zh-CN.md) | English

`opencode-plusplus-mcp` exposes OpenCode++ through stdio MCP.

This is a developer and compatibility surface. Normal OpenCode Desktop users install the Windows EXE and select the `OpenCode++` primary mode; they do not configure this MCP server.

## Foundation Tools

- `opencode_plusplus_build`
- `opencode_plusplus_plan`
- `opencode_plusplus_pack`
- `opencode_plusplus_retrieve`
- `opencode_plusplus_tests`
- `opencode_plusplus_impact`
- `opencode_plusplus_verify`
- `opencode_plusplus_explain`

## Context Compatibility Tools

- `opencode_plusplus_context_search`
- `opencode_plusplus_context_get`
- `opencode_plusplus_context_status`
- `opencode_plusplus_interventions`
- `opencode_plusplus_context_feedback`

These developer and compatibility tools call the same application services as the OpenCode Desktop plugin. They do not start a CLI subprocess or invoke a model.

`context_search` supports exact or fuzzy queries plus `topK`, `taskType`, `language`, `packageVersion`, `source`, and `tags` filters. Hits contain deterministic scores and a score breakdown. `context_get` supports `entryId`, `language`, `packageVersion`, `source`, `file`, `full`, and `withAnnotations`.

`context_status` returns registry sources, cache state, working-tree freshness, selected and rejected Context, and the current intervention summary. `interventions` requires a `taskId` and returns the ledger events plus their status summary.

The four read tools return a shared envelope:

```json
{
  "schemaVersion": "opencode-plusplus.context-tools.v1",
  "ok": true,
  "tool": "context-search",
  "data": {}
}
```

Failures set `ok` to `false` and return a stable `error.code`, `message`, `details`, and `retryable`. Path traversal, malformed arguments, unknown entries, unavailable sources, network failures, invalid registries, and corrupt state remain structured errors.

External Context and annotations are untrusted guidance. They cannot authorize commands, close a blocker, or satisfy test, contract, freshness, forbidden-path, or finalize evidence.

## Experimental Runtime Tools

- `opencode_plusplus_start_loop`
- `opencode_plusplus_step`
- `opencode_plusplus_evaluate`
- `opencode_plusplus_repair`
- `opencode_plusplus_finalize`

Runtime tools return structured gate fields such as `nextAction`, `blocking`, `requiredCommands`, `mustInspect`, `allowedEditGlobs`, `avoidEditGlobs`, and `missingEvidence`.

## Status

The stdio server and core tools are a Foundation capability. Context tools are compatibility surfaces for developers; OpenCode Desktop users should use the release EXE and OpenCode++ mode. Agent Native Runtime tools are Experimental and still need per-client end-to-end validation.
