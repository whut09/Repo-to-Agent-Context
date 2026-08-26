# Context Feedback

[中文](context-feedback.zh-CN.md) | English

Context feedback records whether a Context entry, companion file, retrieval result, or intervention suggestion was useful. It is a quality signal, not verification evidence.

## Labels

Supported labels are `useful`, `not-useful`, `outdated`, `inaccurate`, `incomplete`, `wrong-version`, `wrong-example`, and `irrelevant`.

Each record contains only `entryId`, `source`, optional version, content revision, optional relative file, target identifier, label, generated ID, and timestamp. It does not contain task text, source code, file content, absolute repository paths, credentials, or arbitrary comments.

## Desktop Use

OpenCode Desktop exposes `opencode_plusplus_context_feedback`. Call it explicitly after using Context:

```json
{
  "entryId": "official/payments",
  "source": "official",
  "version": "2.0.0",
  "revision": 3,
  "target": "entry",
  "label": "useful"
}
```

The tool writes the local record and returns current local statistics plus network submission status. It does not call a model. The same application service is available to the development-only MCP compatibility surface.

## Storage

Feedback is stored atomically under `.agent-context/context-registry/feedback/`. The store has `schemaVersion` and `revision`; duplicate feedback IDs are idempotent, and corrupt JSON produces a diagnostic instead of an empty result.

Local annotations remain under `.agent-context/knowledge/annotations/`. An annotation is user-written Context that can be explicitly injected as untrusted information. Feedback is maintainer-facing quality metadata and is never injected.

## Network Boundary

Network submission is disabled unless `feedback.telemetry`, `feedback.network`, and `feedback.endpoint` are all explicitly configured. Only the same safe feedback metadata is sent. Endpoint URLs cannot contain credentials. Offline or failed submission preserves the local record.

## Ranking Boundary

Feedback statistics do not affect retrieval by default. `feedback.useLocalQualitySignals: true` enables a bounded score in the `localFeedback` score breakdown. It cannot override an exact ID and has no authority over commands, evidence, Guard gates, Policy, interventions, or finalize.
