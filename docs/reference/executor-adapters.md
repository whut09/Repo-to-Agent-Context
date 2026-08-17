# Executor Adapters

Executor adapters let OpenCode++ treat external code agents as replaceable coding tools.

## Maturity

| Executor / Adapter                | Maturity   | Notes                                                                                |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `mock`                            | Stable     | Deterministic demo and CI executor.                                                  |
| OpenCode preset                   | Foundation | OpenCode++ `opencode` / `oc` subcommands with the default `opencode run` command.    |
| generic `--executor-command`      | Foundation | Calls scriptable CLIs such as OpenCode, Codex, Claude Code, Cursor, and MiMoCode.    |
| OpenCode event normalizer         | Foundation | Supports `opencode run --format json`, transcript files, and stdout/stderr fallback. |
| MiMoCode native normalizer        | Planned    | Native event format support is planned.                                              |
| Codex JSONL normalizer            | Planned    | Current path is the generic command adapter.                                         |
| Claude Code transcript normalizer | Planned    | Current path is the generic command adapter.                                         |
| Cursor native adapter             | Planned    | Current path is docs, MCP, and generic command hooks.                                |

## Generic Command

OpenCode has a first-class preset:

```bash
opencode-plusplus
opencode-plusplus oc init .
opencode-plusplus opencode doctor .
opencode-plusplus opencode run "<task>" .
opencode-plusplus oc run "<task>" .
opencode-plusplus oc report --last
opencode-plusplus oc repair
```

The preset expands to:

```bash
opencode run --format json --dir {repo} "Follow the attached OpenCode++ task prompt." --file {prompt}
```

Use the generic adapter for other executors or custom OpenCode commands:

```bash
opencode-plusplus orchestrate "<task>" . \
  --executor opencode \
  --executor-command "opencode run --format json --dir {repo} \"Follow the attached OpenCode++ task prompt.\" --file {prompt}" \
  --max-loops 3
```

Placeholders:

- `{prompt}`: per-iteration prompt file path
- `{task}`
- `{repo}`
- `{runDir}`
- `{agent}`

Executor commands are parsed as argv-style commands and run without a shell.
