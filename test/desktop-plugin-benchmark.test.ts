import assert from "node:assert/strict";
import test from "node:test";
import { renderDesktopPluginBenchmark, runDesktopPluginBenchmark } from "../src/benchmarks/desktop-plugin-benchmark.js";

test("Desktop plugin harness benchmark is deterministic and model-free", async () => {
  const result = await runDesktopPluginBenchmark();
  assert.equal(result.kind, "deterministic-desktop-plugin");
  assert.equal(result.paidModelCalls, 0);
  assert.equal(result.passed, true);
  assert.deepEqual(
    result.checks.map((check) => check.id),
    ["tool-registration", "prepare", "retrieve", "evaluate", "next"]
  );
  assert.equal(
    result.checks.every((check) => check.passed),
    true
  );
  assert.equal(
    result.selectedFiles.some((file) => file.includes("auth")),
    true
  );

  const markdown = renderDesktopPluginBenchmark(result);
  assert.match(markdown, /Deterministic Desktop Plugin Harness Benchmark/);
  assert.match(markdown, /Paid model calls: 0/);
  assert.match(markdown, /does not call a model or external executor/);
});
