# Retrieval Providers

[中文](retrieval.zh-CN.md) | English

OpenCode++ retrieval is a provider protocol, not a single RAG framework.

## Providers

| Provider    | Status          | Purpose                                                                 |
| ----------- | --------------- | ----------------------------------------------------------------------- |
| `static`    | Stable          | Search generated context, file index, symbols, summaries, and evidence. |
| `ripgrep`   | Foundation      | Search source text through `rg` when available.                         |
| `hybrid`    | Foundation      | Merge static and ripgrep results.                                       |
| `codegraph` | Foundation      | Optional adapter for existing `.codegraph` projects.                    |
| `lightrag`  | Planned adapter | Direct server sync is planned; JSONL export exists today.               |
| `embedding` | Planned adapter | External vector store and embedding services.                           |

## Examples

```bash
opencode-plusplus retrieve "fix auth timeout" . --provider hybrid
opencode-plusplus retrieve "fix auth timeout" . --provider codegraph
opencode-plusplus rag export .
```

Internal graph remains the portable foundation. CodeGraph and RAG providers are optional deep-code-intelligence backends.
