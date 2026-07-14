# Runtime State Machine

Runtime state is written under:

```txt
.agent-context/runs/<task-id>/state.json
```

Typical states:

- `EMPTY`
- `CONTEXT_READY`
- `TASK_PACK_READY`
- `EDIT_BOUNDARY_READY`
- `AGENT_STARTED`
- `EDITED`
- `VERIFYING`
- `REPAIRING`
- `READY_FOR_REVIEW`
- `BLOCKED`

The state file records:

- current state and previous state
- task id
- repository/context/diff hashes
- last action
- blocking next action
- allowed actions
- satisfied evidence
- missing evidence

The state machine is intentionally explicit. OpenCode++ reports the next allowed action; the external code agent, user, or CI workflow executes it.

## Iteration Convergence

Harness-led runs also record a deterministic convergence fingerprint for every iteration. The fingerprint contains:

- current working-tree hash
- raw Harness decision action
- blocking finding and Guard Gate IDs
- missing evidence
- required commands
- context freshness and drift

Array inputs are deduplicated and sorted before hashing, so the same logical state produces the same SHA-256 fingerprint regardless of collection order. The normalized fingerprint state is persisted beside the hash so a future resume flow can compare iterations without reconstructing transient in-memory objects.

Convergence statuses are:

- `progressing`: another repair, repack, or test iteration is allowed.
- `terminal`: an existing `finalize`, `block`, `rollback`, or `human-review` decision stopped the run.
- `executor-failure`: the executor returned a non-zero or unknown exit code.
- `repeated-state`: two consecutive blocking iterations produced the same fingerprint; the run stops with `human-review` and `repeated-state/no-progress`.
- `max-loops-reached`: the loop budget ended before a terminal decision. A single-loop run reports this status and cannot be classified as repeated state.

Convergence is written into the final orchestrator report, each iteration report, `iteration.json`, and `decision.json`.
