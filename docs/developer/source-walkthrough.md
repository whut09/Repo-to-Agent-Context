# Source Walkthrough

For the detailed code-path explanation, read [Loop Engineering](../concepts/loop-engineering.md).

High-level flow:

```txt
CLI / MCP adapters
  -> application services
  -> buildContextPackage()
  -> scanRepository()
  -> indexRepository()
  -> buildDependencyGraph()
  -> rankFiles()
  -> assessReadiness()
  -> writeContextPackage()
```

Harness-led flow:

```txt
orchestrate()
  -> task run
  -> executor adapter
  -> trace normalizer
  -> guard reports
  -> guard gates
  -> decision report
```

Key source areas:

- `src/application/`: shared context, task, retrieval, and verification use cases called by CLI and MCP adapters.
- `src/core/`: scan, index, graph, rank, token, freshness.
- `src/harness/`: control plane, verification plane, observability.
- `src/outputs/`: artifact rendering and compatibility wrappers.
- `src/mcp/`: stdio MCP schema registration, argument adaptation, application-service dispatch, and MCP result conversion.
- `src/retrievers/`: static, ripgrep, hybrid, CodeGraph, external provider protocols.
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

Application services return domain results rather than CLI text or MCP envelopes. CLI remains responsible for terminal formatting and exit codes; MCP remains responsible for Zod schemas and `structuredContent` conversion. Sidecar public exports remain in `sidecar.ts`, while implementation modules do not import the facade at runtime; type-only imports preserve compatibility without creating runtime cycles.
