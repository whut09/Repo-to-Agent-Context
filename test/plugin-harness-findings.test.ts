import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFindings, evaluateMissingEvidence, evaluateRequiredCommands } from "../src/integrations/opencode/plugin-runtime/harness/findings.js";
import type { LoopControllerReport } from "../src/harness/control-plane/loop-controller.js";
import type { PolicyEngineReport } from "../src/harness/verification-plane/policy-engine.js";
import type { OpenCodeSidecarGuardStackSummary } from "../src/integrations/opencode/sidecar.js";

test("evaluate findings summarize policy and guard-stack blockers", () => {
  const findings = evaluateFindings({
    policy: {
      findings: [
        { id: "policy.required.tests", status: "missing", message: "tests missing" },
        { id: "policy.ok", status: "satisfied", message: "ok" }
      ]
    } as PolicyEngineReport,
    guardStack: {
      ran: true,
      passed: false,
      base: "main",
      artifacts: {},
      contracts: { passed: false, violations: 2 },
      hallucination: { errors: 1, warnings: 0 },
      regression: { matches: 0, missingRequiredTestEvidence: 1 }
    } as OpenCodeSidecarGuardStackSummary
  });
  assert.ok(findings.some((item) => item.includes("tests missing")));
  assert.ok(findings.some((item) => item.includes("contracts: 2")));
  assert.ok(findings.some((item) => item.includes("hallucination errors: 1")));
});

test("evaluate commands and missing evidence stay unique", () => {
  const loop = {
    decisions: [{ command: "npm run test" }, { command: "npm run test" }],
    runtime: { missingEvidence: ["command evidence"] }
  } as unknown as LoopControllerReport;
  const policy = {
    findings: [{ id: "policy.required.tests", status: "missing", message: "tests missing", requiredAction: "npm run test" }]
  } as PolicyEngineReport;
  assert.deepEqual(evaluateMissingEvidence({ loop, policy }), ["command evidence", "policy.required.tests: tests missing"]);
  assert.deepEqual(evaluateRequiredCommands({ loop, policy }), ["npm run test"]);
});

test("evaluate commands exclude the test selector and explanatory text", () => {
  const loop = {
    decisions: [{ command: "opencode-plusplus tests . --diff --base main" }],
    runtime: { missingEvidence: [] }
  } as unknown as LoopControllerReport;
  const policy = {
    findings: [
      {
        id: "policy.required.tests",
        status: "missing",
        message: "tests missing",
        requiredAction: "No runnable test command is configured; choose one before finalizing."
      }
    ]
  } as PolicyEngineReport;

  assert.deepEqual(evaluateRequiredCommands({ loop, policy }), []);
});
