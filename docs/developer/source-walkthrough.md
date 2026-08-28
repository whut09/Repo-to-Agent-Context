# Source Walkthrough

[中文](source-walkthrough.zh-CN.md) | English

For the detailed code-path explanation, read [Loop Engineering](../concepts/loop-engineering.md).

The primary user flow is the in-process Desktop plugin:

```txt
OpenCode Desktop
  -> plugin hooks and Harness tools
  -> application services
  -> context / retrieval / Guard / evidence / policy
  -> actionSummary + visualization + .agent-context artifacts
```

The developer CLI/MCP context flow is:

```txt
CLI / MCP
  -> application services
  -> buildContextPackage()
  -> scanRepository()
  -> indexRepository()
  -> buildDependencyGraph()
  -> rankFiles()
  -> assessReadiness()
  -> writeContextPackage()
```

Only the optional developer Harness-led flow owns an external executor loop:

```txt
orchestrate()
  -> typed phases
  -> executor adapter
  -> trace and evidence
  -> guard / policy evaluation
  -> decision and convergence
  -> persisted report
```

Key source areas:

- `src/application/`: shared context, task, retrieval, and verification use cases called by Desktop plugin tools, CLI, and MCP adapters.
- `src/core/`: scan, index, graph, rank, token, freshness.
- `src/harness/`: control plane, verification plane, observability.
- `src/outputs/`: artifact rendering and compatibility wrappers.
- `src/mcp/`: stdio MCP schema registration, argument adaptation, application-service dispatch, and MCP result conversion.
- `src/retrievers/`: static, ripgrep, hybrid, CodeGraph, external provider protocols.
- `src/integrations/opencode/plugin-runtime/`: in-process Desktop tools, hooks, action summaries, visualization, and session state.
- `src/integrations/opencode/sidecar-*.ts`: command/path guards, evidence recording, incremental verification, and report rendering behind the stable `sidecar.ts` facade.

## Application Service Boundary

Before the service split, CLI commands and MCP handlers each built context and assembled task/test/impact results directly:

```txt
CLI -> core + outputs
MCP -> core + outputs
Sidecar -> core + verification + outputs
```

The focused boundary is now:

```txt
CLI -----------\
                -> application services -> core / harness / outputs
MCP -----------/

Sidecar facade -> command guard
               -> protected path guard
               -> evidence recorder
               -> incremental verifier -> application context service
               -> report renderer

Orchestrator -> typed phases + artifact/state repositories
             -> orchestrator report renderer
```

Application services return domain results rather than Desktop text, CLI text, or MCP envelopes. The plugin formats structured tool results and human-readable summaries; CLI remains responsible for terminal formatting and exit codes; MCP remains responsible for Zod schemas and `structuredContent` conversion. Sidecar public exports remain in `sidecar.ts`, while implementation modules do not import the facade at runtime; type-only imports preserve compatibility without creating runtime cycles.
