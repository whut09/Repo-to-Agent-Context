# Guard Gate Schema

[中文](guard-gate-schema.zh-CN.md) | English

Guard modules emit normalized findings and gates.

```txt
.agent-context/runs/<task-id>/iterations/<nnn>/
  guard.findings.json
  guard.gates.json
  decision.json
```

## Finding

```ts
interface GuardFinding {
  id: string;
  source: "policy" | "hallucination" | "regression";
  kind: "forbidden" | "required" | "risk" | "info";
  status: "failed" | "missing" | "warning" | "satisfied" | "passed";
  severity: "error" | "warning" | "required" | "info";
  message: string;
  evidence: string[];
  requiredCommands: string[];
}
```

## Gate

```ts
interface GuardGate {
  id: string;
  guard: "context" | "boundary" | "evidence" | "hallucination" | "regression";
  blocking: boolean;
  action: "repack" | "rollback" | "human-review" | "run-tests" | "repair" | "block";
  evidence: string[];
  findingIds: string[];
}
```

Gates, executor failures, policy findings, Loop decisions, and risk signals are normalized into `HarnessDecisionCandidate` records before arbitration. Candidate ordering is deterministic and uses the shared action priority:

```txt
rollback > block > repack > repair > run-tests > human-review > finalize
```

The highest-priority candidate becomes the selected action. Remaining candidates are retained as supporting candidates; their reasons, required commands, and artifacts are merged into the final decision with stable deduplication. `decision.json` and the orchestrator Markdown report record the selected candidate, selected priority, and supporting candidates, so the result does not depend on Guard Gate array order.
