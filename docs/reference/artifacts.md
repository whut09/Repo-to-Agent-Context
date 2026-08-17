# Artifacts Reference

[中文](artifacts.zh-CN.md) | English

OpenCode++ writes human-readable Markdown and machine-readable JSON.

For whether each generated file should be committed, see [Generated Files and Commit Policy](generated-files.md).

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
