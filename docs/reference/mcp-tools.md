# MCP Tools

[中文](mcp-tools.zh-CN.md) | English

`opencode-plusplus-mcp` exposes OpenCode++ through stdio MCP.

## Foundation Tools

- `opencode_plusplus_build`
- `opencode_plusplus_plan`
- `opencode_plusplus_pack`
- `opencode_plusplus_retrieve`
- `opencode_plusplus_tests`
- `opencode_plusplus_impact`
- `opencode_plusplus_verify`
- `opencode_plusplus_explain`

## Experimental Runtime Tools

- `opencode_plusplus_start_loop`
- `opencode_plusplus_step`
- `opencode_plusplus_evaluate`
- `opencode_plusplus_repair`
- `opencode_plusplus_finalize`

Runtime tools return structured gate fields such as `nextAction`, `blocking`, `requiredCommands`, `mustInspect`, `allowedEditGlobs`, `avoidEditGlobs`, and `missingEvidence`.

## Status

The stdio server and core tools are a Foundation capability. Agent Native Runtime tools are Experimental and still need per-client end-to-end validation.
