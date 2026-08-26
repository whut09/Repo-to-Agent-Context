import assert from "node:assert/strict";
import test from "node:test";
import { validateContextExplainabilityScenarios } from "../src/benchmarks/context-explainability-scenarios.js";

test("Context explainability scenario validation normalizes deterministic fields", () => {
  const result = validateContextExplainabilityScenarios([
    {
      id: "sample",
      taskId: "task",
      fixture: "small-ts-app",
      task: "fix auth",
      taskType: "bugfix",
      source: "private",
      packageVersion: "1.0.0",
      contentRevision: 1,
      scenario: "positive",
      relevantFiles: ["src\\auth.ts"],
      rejectedFiles: ["src/billing.ts"]
    }
  ]);
  assert.deepEqual(result[0]?.relevantFiles, ["src/auth.ts"]);
});

test("Context explainability scenario validation rejects traversal and duplicate IDs", () => {
  const base = {
    id: "sample",
    taskId: "task",
    fixture: "small-ts-app",
    task: "fix auth",
    taskType: "bugfix",
    source: "private",
    packageVersion: "1.0.0",
    contentRevision: 1,
    scenario: "positive",
    relevantFiles: ["src/auth.ts"],
    rejectedFiles: ["src/billing.ts"]
  };
  assert.throws(() => validateContextExplainabilityScenarios([{ ...base, fixture: "../secret" }]), /path traversal/);
  assert.throws(() => validateContextExplainabilityScenarios([base, { ...base }]), /must be unique/);
  assert.throws(() => validateContextExplainabilityScenarios([{ ...base, scenario: "imaginary" }]), /unsupported/);
});
