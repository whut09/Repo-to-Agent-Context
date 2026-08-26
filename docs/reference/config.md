# Configuration

[中文](config.zh-CN.md) | English

Default config file:

```txt
opencode-plusplus.config.yml
```

Local private config file:

```txt
opencode-plusplus.local.yml
```

Do not commit `opencode-plusplus.local.yml`.

## Example

```yaml
target: opencode
evidencePolicy: advisory
feedback:
  enabled: true
  telemetry: false
  network: false
  useLocalQualitySignals: false
tokenBudget: 60000

include:
  - "**/*"

exclude:
  - node_modules/**
  - dist/**
  - build/**
  - coverage/**
  - .next/**
  - .venv/**

tokenizer:
  mode: chars_approx
  # mode: cl100k_base
  # model: gpt-4.1

agents:
  mode: minimal
  maxTokens: 1200
  manualSources:
    - AGENTS.manual.md
  include:
    - commands
    - safety
    - entrypoints
    - contextLinks

llm:
  enabled: false
  provider: openai-compatible
  baseUrl: xx
  apiKey: xx
  model: xx
  temperature: 0.2
  maxTokens: 1200

rag:
  provider: lightrag
  chunkTokenLimit: 900

outputs:
  agents: true
  modules: true
  graph: true
  tasks: true
  readiness: true
  rag: true
```

Config files use `tokenizer.mode: chars_approx`; the CLI option `--tokenizer chars-approx` is accepted and normalized for command-line convenience.

## Evidence Policy

`evidencePolicy` controls the minimum trusted evidence that can close test and contract requirements:

- `advisory` preserves compatibility. Manual evidence can satisfy requirements, but reports mark it as a claim rather than system verification.
- `balanced` accepts manual evidence for non-critical checks, but source or config changes require harness-captured command evidence or CI for tests. This is the recommended explicit mode for normal PR workflows.
- `strict` requires current-working-tree command or CI evidence for both tests and contract validation. Manual evidence remains visible as supporting context but cannot close a blocking requirement.

The default remains `advisory` so existing configuration files keep their previous behavior. CLI commands that evaluate evidence accept `--evidence-policy advisory|balanced|strict`; MCP runtime tools accept the equivalent `evidencePolicy` field.

## Context Feedback

`feedback.enabled` controls local Context quality feedback. It defaults to `true`; records contain only entry/source/version/revision/file identifiers and a fixed label. Task text, source content, absolute repository paths, and secrets are not stored.

`feedback.telemetry` and `feedback.network` both default to `false`. Network submission occurs only when both are explicitly enabled and `feedback.endpoint` is an HTTP(S) URL without embedded credentials. A network failure never removes the local record.

`feedback.useLocalQualitySignals` defaults to `false`. When enabled, local useful/not-useful statistics add a bounded, explainable ranking signal. The signal cannot override an exact Context ID match and never affects evidence, Guard, Policy, or finalize decisions.

Local annotations and maintainer feedback are separate: annotations are repository knowledge that may be explicitly injected as untrusted Context; feedback is quality metadata and is never injected into model context.

## LLM Credentials

Committed examples should keep `baseUrl`, `apiKey`, and `model` as `xx`. Real credentials belong only in `opencode-plusplus.local.yml`.
