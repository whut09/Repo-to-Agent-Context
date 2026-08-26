# Benchmark Guide

[中文](benchmark-guide.zh-CN.md) | English

OpenCode++ uses two benchmark layers. Their results answer different questions and must not be combined into one success-rate claim.

## Layer A: Fast Deterministic Benchmark

The fast layer runs on every pull request and does not call a paid agent:

```bash
npm run benchmark
npm run benchmark:agent
npm run benchmark:explainability
```

`benchmark` measures fixture-based retrieval, boundaries, evidence, regression memory, and decision behavior. `benchmark:agent` runs `benchmark-agent --executor mock --dry-run` across `no-context`, `agents-md`, `context-pack`, and `loop-enabled-harness`.

The mock result is labeled `deterministic-proxy`. It validates repeatability and harness wiring, but it is not a real-agent success delta, token measurement, cost measurement, or convergence claim.

### Context Explainability Benchmark

`benchmark:explainability` runs the Context Registry, retrieval service, Context fetch/cache, freshness status, and Intervention Ledger against six deterministic fixture scenarios:

- positive retrieval and current command evidence;
- similar but unrelated files;
- stale Context after a working-tree edit;
- an inaccurate local annotation;
- an external Context suggestion containing a wrong command;
- a successful test followed by another edit.

It writes `benchmarks/results/context-explainability/result.json` and `result.md` when run through the package script. Each sample records task type, fixture, source, package version, content revision, prompt hash, fixture commit, selected/rejected files, Context selected/omitted files, cache/freshness, retrieval score breakdowns, intervention events, expected/final decision, and metric values.

The report includes Precision@K, Recall@K, selected/rejected file accuracy, Context cache hit rate, fetch duration, stale detection, intervention detection, verified-fix precision, false-fixed rate, unresolved blocker recall, human-review rate, and token savings. Every metric includes sample count, mean, median, sample standard deviation, and 95% confidence interval. A prevention or human-review event is never counted as a verified fix.

## Layer B: Real Executor Benchmark

The real layer uses `benchmark-agent-real` and rejects the mock adapter:

```bash
npm run benchmark:agent:real -- \
  --executor codex \
  --executor-command "codex exec --prompt-file {prompt}" \
  --model example-model \
  --executor-version 1.2.3 \
  --repetitions 3 \
  --seeds 11,22,33
```

Supported adapters are OpenCode, Codex CLI, Claude Code, MiMoCode, and Cursor. The command is supplied externally so CI can track the installed CLI syntax without hardcoding vendor-specific commands in OpenCode++. Placeholders include `{prompt}`, `{task}`, `{repo}`, `{runDir}`, `{agent}`, and `{seed}`.

Each task and selected mode runs once per repetition. JSON and Markdown reports are written to `benchmarks/results/real/` by default. Reports record:

- executor, model/profile, executor version, and SHA-256 command hash;
- prompt hash, repository commit, Node version, platform, and architecture;
- repetitions, seeds, task IDs, modes, policy threshold, and loop limit;
- per-run token usage, estimated cost, elapsed time, command count, loop count, and outcome details.

The report summarizes sample count, mean, median, sample standard deviation, and a 95% confidence interval for:

- final success, test pass, decision accuracy, and repair-loop convergence rates;
- wrong-file edit, forbidden edit, hallucinated command, no-progress, and human-review rates;
- token usage, estimated cost, elapsed time, command count, and loop count;
- context Recall@K and Precision@K.

Token and cost fields are `null` when an executor does not emit recognizable usage JSON. A missing usage value is not converted to zero.

## Baselines and Regressions

Compare only compatible real runs:

```bash
npm run benchmark:agent:real -- \
  --executor codex \
  --executor-command "$CODEX_BENCHMARK_COMMAND" \
  --baseline benchmarks/baselines/codex-example.json \
  --regression-threshold 0.05 \
  --fail-on-regression
```

The threshold is an absolute change in the metric mean. Higher is better for success, convergence, recall, precision, test pass, and decision accuracy. Lower is better for edit violations, hallucinations, no-progress, human review, tokens, cost, time, commands, and loops.

Do not create a baseline from mock results or fabricate real-agent values. Promote a real JSON report only after reviewing its executor/model/version, prompt hashes, repository commit, and configuration.

## CI Operation

`.github/workflows/ci.yml` runs only the fast deterministic layer. `.github/workflows/benchmark-real.yml` is manual-only and obtains executor commands exclusively from repository secrets. Enable a schedule only after configuring the matching executor command secret:

- `OPENCODE_BENCHMARK_COMMAND`
- `CODEX_BENCHMARK_COMMAND`
- `CLAUDE_CODE_BENCHMARK_COMMAND`
- `MIMOCODE_BENCHMARK_COMMAND`

The raw command is not stored in benchmark reports; only its hash is retained. Workflow artifacts contain machine-readable JSON and readable Markdown.

## Retrieval Improvement Track

Precision@8 and regression recall should be improved without changing expected files merely to raise scores. Candidate improvements are symbol-level task relevance, call/dependency-chain weighting, regression-memory weighting, task-type adaptive Top-K, and explicit task-specific negative examples. Validate each change with the deterministic layer before measuring its effect with real executors.

The deterministic JSON report now includes `summary.sampleCount`, `summary.elapsedMs`, and per-hit retrieval score breakdowns. Precision is the fraction of the requested Top-K slots that are expected relevant files; recall is the fraction of expected relevant files found in Top-K. A cached context may report reused, incremental, or rebuilt mode, but freshness and drift checks still run before a plugin uses the context.

Desktop retrieval defaults are task-aware: bug fixes use six files, features eight, refactors ten, and `auto` eight. The plugin reports selected and rejected candidates so a low Precision@K result can be inspected rather than treated as an opaque score. Explicit negative examples receive a strong penalty unless the task names that path directly.

For Desktop responsiveness, `prepare`, `retrieve`, and `evaluate` return a structured `performance` object with stage, target, elapsed time, cache status, context mode, selected files, and rejected files. A timeout returns `ok: false` and `error.code: HARNESS_ERROR`; it does not claim that the task failed its verification policy.
