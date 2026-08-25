# Intervention Ledger Reference

[中文](intervention-ledger.zh-CN.md) | English

The Intervention Ledger is a local, append-only record of Harness findings and actions. It is written to `.agent-context/interventions/<task-id>.json` with the existing atomic JSON store. Runtime ledgers are local artifacts and must not be committed or packaged.

## Event Contract

Each event contains a stable `interventionId` and idempotent `eventId`, task/session identity, phase, category, finding, target files, action, before/after state, evidence references, status, confidence, and source. Optional trace and decision references provide reverse lookup.

## Verification Boundary

Only valid command or CI evidence captured for the current working tree can transition an intervention to `verified`. Manual evidence remains visible but cannot close a blocking requirement. A later edit supersedes earlier evidence and produces `stale`; it must not be rendered as fixed.

## Recovery

Concurrent appends use the shared file lock and atomic store. Duplicate event IDs are ignored. Corrupt JSON, unsupported schema versions, and invalid transitions produce diagnostic errors instead of an empty ledger.
