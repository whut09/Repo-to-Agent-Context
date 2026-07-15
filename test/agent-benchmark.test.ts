import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { renderAgentBehaviorBenchmark, runAgentBehaviorBenchmark } from "../src/benchmarks/agent-benchmark.js";

test("agent behavior benchmark runs all context modes with the mock executor", async () => {
  const result = await runAgentBehaviorBenchmark({
    benchmarkDir: path.resolve("benchmarks"),
    executor: "mock",
    dryRun: true,
    taskIds: ["fix-login-timeout"],
    modes: ["no-context", "agents-md", "context-pack", "loop-enabled-harness"],
    maxLoops: 2
  });

  assert.equal(result.tasks, 1);
  assert.equal(result.kind, "deterministic-proxy");
  assert.equal(result.runs.length, 4);
  assert.deepEqual(
    result.runs.map((run) => run.mode),
    ["no-context", "agents-md", "context-pack", "loop-enabled-harness"]
  );
  assert.ok(result.summary.some((item) => item.mode === "loop-enabled-harness"));
  assert.ok(result.runs.every((run) => run.executor === "mock"));
  assert.ok(result.runs.every((run) => run.loopCount >= 1));
  assert.ok(result.runs.every((run) => typeof run.forbiddenFilesChanged === "number"));
  assert.ok(result.runs.every((run) => typeof run.testsMissing === "number"));
  assert.ok(result.runs.every((run) => typeof run.testsFailed === "number"));
  assert.ok(result.runs.every((run) => typeof run.hallucinatedCommands === "number"));
  assert.ok(result.runs.every((run) => typeof run.finalDecisionAccuracy === "boolean"));
  assert.ok(result.runs.every((run) => typeof run.humanReviewNeeded === "boolean"));
  assert.ok(result.runs.every((run) => typeof run.elapsedMs === "number"));
  assert.ok(result.runs.every((run) => typeof run.promptHash === "string"));
  assert.ok(result.runs.every((run) => typeof run.noProgress === "boolean"));
  assert.ok(result.runs.every((run) => typeof run.success === "boolean"));

  const markdown = renderAgentBehaviorBenchmark(result);
  assert.match(markdown, /# Deterministic Agent Benchmark Proxy/);
  assert.match(markdown, /must not be reported as real executor success or cost/);
  assert.match(markdown, /Mode Comparison/);
  assert.match(markdown, /A\. no context/);
  assert.match(markdown, /D\. harness-led/);
  assert.match(markdown, /OpenCode/);
  assert.match(markdown, /Hallucinated commands/);
  assert.match(markdown, /Human review/);
});
