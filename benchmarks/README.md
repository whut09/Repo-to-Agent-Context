# Harness Benchmark

This demo benchmark measures whether the project changes agent behavior, not just whether it produces attractive context files. It compares four modes:

- A. `no-context`: the agent receives only the task.
- B. `agents-md`: the agent receives the minimal root `AGENTS.md`.
- C. `context-pack`: the agent receives the task-aware context pack.
- D. `loop-enabled-harness`: the agent receives context pack plus policy, contract, trace, and verify-loop signals.

Run:

```bash
npm run benchmark
npm run benchmark:agent
# or
opencode-plusplus benchmark benchmarks --top-k 8
opencode-plusplus benchmark benchmarks --json
opencode-plusplus benchmark-agent benchmarks --executor mock --dry-run
```

Fixtures:

- `small-ts-app`: TypeScript auth/session flow.
- `react-app`: React auth state UI.
- `fastapi-app`: FastAPI route/schema flow.
- `monorepo`: shared config package used by API and web packages.

Phase 6 task set:

- 3 bugfix tasks: `fix-login-timeout`, `fix-react-auth-state`, `fix-fastapi-user-default`.
- 2 feature tasks: `add-api-field`, `add-auth-audit-event`.
- 2 refactor tasks: `refactor-config-loader`, `refactor-session-expiry`.
- 1 hallucinated API / command task: `hallucinated-auth-command`.
- 1 protected path task: `protected-lockfile-edit`.
- 1 regression task: `regression-session-ttl`.

Benchmark categories:

- Context Recall Benchmark: given a task, checks whether the top K task pack includes the expected source and test files.
- Boundary Benchmark: uses protected-path tasks and measures whether harness evaluation blocks or cleans forbidden edits.
- Evidence Benchmark: uses hallucinated or fake verification tasks and measures whether missing or polluted evidence is detected.
- Regression Benchmark: repeats historical bug patterns and measures whether required regression tests are preserved.

Headline metrics shown in README and benchmark output:

- `context_recall@8`: expected task-relevant files found in the task pack top 8.
- `boundary_violation_block_rate`: protected-path scenarios where the loop-enabled harness blocks or prevents forbidden edits.
- `hallucination_detection_rate`: fake command / invented evidence scenarios caught or cleaned by the harness.
- `false_positive_rate`: clean loop-enabled harness runs that still require human review or inaccurate blocking. Lower is better.
- `repair_loop_convergence_rate`: tasks where loop-enabled harness converges with no more repair loops than the no-context baseline.

Detailed metrics:

- `wrong_files_changed`: files changed outside the expected edit surface.
- `forbidden_files_changed`: protected or forbidden files changed.
- `tests_missing`: required test evidence missing.
- `tests_failed`: executor or test command failure count.
- `hallucinated_commands`: missing package scripts or commands claimed by the agent.
- `iterations_to_finish`: loop iterations or agent turns needed to reach the final decision.
- `final_decision_accuracy`: whether the gate decision matches the observed evidence.
- `human_review_needed`: whether the run should stop for human review.
- `Wrong file edits reduction`: unrelated-file edits reduced from A to D.
- `Test failure reduction`: failed-test rate reduced from A to D.
- `Steps per task reduction`: iterations or turns reduced from A to D.
- `Token usage reduction`: token usage reduced from A to D.
- `Repair loops reduction`: retry, repair, or re-plan cycles reduced from A to D.
- `Loop moat score`: normalized behavior improvement across wrong edits, test failures, steps, tokens, and repair loops.
- `Recall@K`: expected task-relevant files present in the task pack top K.
- `Precision@K`: top K slots occupied by expected task-relevant files.
- `Token compression ratio`: fixture token estimate divided by task-pack token estimate.
- `Test recommendation accuracy`: expected tests present in minimal or regression test recommendations.
- `Agent success delta`: average score delta from `no-context` to `loop-enabled-harness` when `benchmarks/agent-runs/*.json` records exist.
- `Agent success delta proxy`: deterministic fallback comparing task-pack coverage with non-task-aware key-file baseline coverage. It is not a live agent run; use it as a repeatable demo signal.

Agent run records:

`benchmarks/agent-runs/*.json` contains manual or automated evaluation records with this shape:

```json
{
  "task": "fix-login-timeout",
  "agent": "manual-eval",
  "mode": "context-pack",
  "changedFiles": ["src/auth/session.ts"],
  "passedTests": true,
  "unrelatedChanges": 0,
  "repairLoops": 1,
  "score": 0.86
}
```

The benchmark groups runs by task and mode across:

- `no-context`
- `agents-md`
- `context-pack`
- `loop-enabled-harness`

Legacy records using `task-pack` and `task-pack-contracts-verify` are still accepted and normalized to the new mode names.

## Deterministic Agent Benchmark Proxy

`benchmark-agent` runs the same task across four modes. The default npm script uses `mock --dry-run`, is deterministic, and runs in pull-request CI:

- A. `no-context`: task only.
- B. `agents-md`: task plus root `AGENTS.md`.
- C. `context-pack`: task plus task-aware pack and edit boundary.
- D. `loop-enabled-harness`: OpenCode++ owns the loop and the code agent is only the executor.

Fast proxy:

```bash
opencode-plusplus benchmark-agent benchmarks --executor mock --dry-run
```

The proxy must not be reported as real executor success, token, cost, or convergence metrics.

## Real Executor Benchmark

`benchmark-agent-real` rejects `mock`, repeats tasks across seeds, and writes separate JSON and Markdown reports. Executor commands are supplied by CLI arguments or CI secrets.

OpenCode example:

```bash
opencode-plusplus benchmark-agent-real benchmarks \
  --executor opencode \
  --executor-command "opencode run --format json --dir {repo} --file {prompt} \"Follow the attached OpenCode++ task prompt.\"" \
  --model example-model \
  --repetitions 3 \
  --seeds 11,22,33 \
  --max-loops 3 \
  --fail-on required
```

Focused task example:

```bash
opencode-plusplus benchmark-agent-real benchmarks \
  --task fix-login-timeout \
  --modes no-context,agents-md,context-pack,loop-enabled-harness \
  --executor opencode \
  --executor-command "opencode run --format json --dir {repo} --file {prompt} \"Follow the attached OpenCode++ task prompt.\"" \
  --keep-workdirs
```

The output table is designed to show behavior, not just static retrieval quality:

| Mode            | Wrong edits | Stale evidence | Test pass | Loops   | Final gate |
| --------------- | ----------- | -------------- | --------- | ------- | ---------- |
| A. no context   | higher      | higher         | weaker    | higher  | weak       |
| B. AGENTS.md    | lower       | medium         | better    | medium  | weak       |
| C. context pack | lower       | lower          | better    | lower   | medium     |
| D. harness-led  | lowest      | lowest         | strongest | bounded | strong     |

Metrics collected per run:

- `changedFiles`
- `unrelatedChanges`
- `forbiddenFilesChanged`
- `passedTests`
- `missingEvidence`
- `testsMissing`
- `testsFailed`
- `hallucinatedCommands`
- `loopCount`
- `iterationsToFinish`
- `finalDecision`
- `finalDecisionAccuracy`
- `humanReviewNeeded`
- `hallucinationFindings`
- `regressionFindings`
- `elapsedMs`
- `commandCount`
- `tokenUsage`
- `estimatedCostUsd`
- `promptHash`
- `seed`
- `repetition`
- `noProgress`
- `success`

Aggregate real metrics include sample count, mean, median, sample standard deviation, and 95% confidence interval. Use `--baseline`, `--regression-threshold`, and `--fail-on-regression` for historical comparisons. Never promote mock-derived values into `benchmarks/baselines/`.
