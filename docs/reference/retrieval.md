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

## Incremental Context Fetch

The Context Registry is fetched through the shared application service used by Desktop and compatibility integrations. Search returns ranked entry metadata; it does not grant policy or command authority to Context content.

Fetching an entry uses three modes:

- `entry`: returns only the primary `DOC.md` or `SKILL.md` content and lists companion files as omitted.
- `file`: returns one explicitly requested companion file after normalized-path and content-hash checks.
- `full`: returns the primary file and all available companion files.

Every fetch reports `selectedFiles`, `omittedFiles`, provenance, source/version/revision hashes, cache status, duration, and working-tree freshness. A changed working tree causes the local source to be rebuilt and revalidated before content is returned. Registry trust and documentation are advisory context; current working-tree command or CI evidence remains the proof of a code change.
