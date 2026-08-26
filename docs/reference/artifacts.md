# Artifacts Reference

[中文](artifacts.zh-CN.md) | English

OpenCode++ writes human-readable Markdown and machine-readable JSON.

For whether each generated file should be committed, see [Generated Files and Commit Policy](generated-files.md).

## Runtime Boundary

The repository `.agent-context/` directory is a local runtime boundary. It contains generated context, Context Registry state, cache entries, annotations, feedback, traces, interventions, and loop reports. These records explain what the plugin did; they do not grant authority and they are not automatically suitable for source control.

```txt
AGENTS.md
.agent-context/
  AGENTS.generated.md
  repo-summary.md
  key-files.md
  module-map.md
  architecture.md
  onboarding.md
  readiness.md
  token-savings.md
  manifest.json
  contracts/
  runs/
  traces/
  hallucination/
  regression/
  memory/candidates/
  graphs/
  index/
  evidence/
  rag/
```

## Always-Loaded

- `AGENTS.md`: minimal operating rules and links.
- `.agent-context/manifest.json`: freshness and drift fingerprints.

## Task-Level

- `.agent-context/runs/<task-id>/plan.md`
- `.agent-context/runs/<task-id>/pack.md`
- `.agent-context/runs/<task-id>/edit-boundary.md`
- `.agent-context/runs/<task-id>/tests.md`
- `.agent-context/runs/<task-id>/impact.md`
- `.agent-context/runs/<task-id>/verify.md`
- `.agent-context/runs/<task-id>/iterations/<nnn>/`

## Machine-Readable Index

- `.agent-context/index/files.json`
- `.agent-context/index/symbols.json`
- `.agent-context/index/modules.json`
- `.agent-context/index/chunks.json`
- `.agent-context/graphs/dependencies.json`

## Guard State

- `.agent-context/contracts/*.json`
- `.agent-context/traces/*.json`
- `.agent-context/hallucination/*.json`
- `.agent-context/regression/*.json`
- `.agent-context/memory/candidates/*.json`

## Context And Intervention Records

| Location                                       | Meaning                                        | Authority                                  |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `.agent-context/registry/context-pack.json`    | Merged local Context Registry pack             | Advisory Context only                      |
| `.agent-context/cache/context-registry/`       | Source snapshots and fetch cache               | Reusable bytes, freshness still required   |
| `.agent-context/context-registry/usage/`       | Entries/files selected by tasks and provenance | Usage history, not evidence                |
| `.agent-context/context-registry/feedback/`    | Local quality labels and aggregate signals     | Feedback only, no direct decision override |
| `.agent-context/knowledge/annotations/`        | User-written repository notes                  | Untrusted, not policy or commands          |
| `.agent-context/interventions/<task-id>.jsonl` | Intervention Ledger events                     | Explanation, not proof by itself           |
| `.agent-context/sidecar/latest.md`             | Human-readable latest summary                  | Presentation of findings and evidence      |

The plugin uses atomic stores for state, trace, report, registry, annotation, and feedback writes. A damaged JSON file, revision conflict, or locked Windows file is reported diagnostically; it is never silently treated as an empty successful state. Runtime artifacts may contain paths, hashes, task intent, command metadata, or redacted output and should be excluded from commits.
