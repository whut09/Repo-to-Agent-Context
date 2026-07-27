# Real Benchmark Baselines

This directory is reserved for reviewed real-executor benchmark baselines.

Do not add fabricated or mock-derived values. Promote a JSON report from `benchmarks/results/real/real-agent-benchmark.json` only after the executor, model, version, prompt hash, repository commit, and benchmark configuration have been reviewed.

Compare a run with a baseline by passing `--baseline <file>`. Use `--fail-on-regression` when a manual workflow should fail after any metric exceeds the configured absolute mean threshold.
