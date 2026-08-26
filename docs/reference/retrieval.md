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

## Context Registry Boundary

The Context Registry is a structured source of project guidance, not a command or policy engine. A pack has a stable entry identity, source identity, package version, content revision, language, trust level, content hash, and a primary file. Local packs may use `DOC.md` or `SKILL.md` with companion files such as references, examples, and error notes. Remote sources are disabled unless explicitly configured and are validated for timeout, size, hash, schema, and offline fallback.

Retrieval combines lexical fields, symbols, dependency chains, source authority, quality, regression memory, and task-specific negative examples. Exact entry IDs outrank quality or trust. Every hit exposes a score breakdown and stable ordering. `relatedFiles` describes useful candidates; `mustInspect` is the smaller set the task workflow requires the model to read; `rejectedFiles` explains candidates intentionally excluded from the pack.

## Incremental Context Fetch

The Context Registry is fetched through the shared application service used by Desktop and compatibility integrations. Search returns ranked entry metadata; it does not grant policy or command authority to Context content.

Fetching an entry uses three modes:

- `entry`: returns only the primary `DOC.md` or `SKILL.md` content and lists companion files as omitted.
- `file`: returns one explicitly requested companion file after normalized-path and content-hash checks.
- `full`: returns the primary file and all available companion files.

Every fetch reports `selectedFiles`, `omittedFiles`, provenance, source/version/revision hashes, cache status, duration, and working-tree freshness. A changed working tree causes the local source to be rebuilt and revalidated before content is returned. Registry trust and documentation are advisory context; current working-tree command or CI evidence remains the proof of a code change.

The default `entry` fetch is incremental and avoids loading every reference. Use an explicit `file` request for one companion file or `full` when the complete pack is needed. A fetch can be reused, incrementally refreshed, or rebuilt, but freshness and drift checks still run. A cache hit only means the bytes were reused safely; it does not mean the Context is authoritative or fresh for a changed source tree.

## Local Annotations

OpenCode++ can keep repository-local notes for environment limits, version differences, recurring failures, conventions, and verified workarounds. Notes are isolated by repository, Context entry, package version, and content revision, and are stored atomically under `.agent-context/knowledge/annotations/`.

Fetch responses expose `annotationAvailable` and stale summaries without injecting note text. Reading or injecting a note must be explicit. Injected notes are labeled `user-written`, `untrusted`, `context-only`, and `not a command`; they cannot satisfy evidence, close a guard blocker, or grant command authority. Notes from an older package version or content revision are stale by default and require explicit opt-in to read.

## Trust And Failure Rules

External Context can suggest file locations, API version details, error-handling ideas, or historical workarounds. It cannot satisfy tests, contract validation, freshness, forbidden-path checks, or finalize conditions. Commands found in Context are displayed as untrusted suggestions and are never executed automatically. A source trust level influences ranking and explanation only; it never overrides command or CI evidence.

On Windows, local and configured source paths are normalized before companion files are read, including paths containing spaces or non-ASCII characters. Traversal, missing files, invalid registry JSON, stale revisions, permission failures, remote timeouts, and unavailable network sources return structured diagnostics rather than an empty successful result.
