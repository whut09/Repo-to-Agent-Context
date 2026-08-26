import assert from "node:assert/strict";
import test from "node:test";
import { decisionFromInterventions } from "../src/benchmarks/context-explainability-interventions.js";

test("prevention, requests, and unverified repairs never count as verified fixes", () => {
  assert.equal(decisionFromInterventions([{ status: "prevented" }]), "block");
  assert.equal(decisionFromInterventions([{ status: "requested" }]), "human-review");
  assert.equal(decisionFromInterventions([{ status: "repaired" }]), "human-review");
  assert.equal(decisionFromInterventions([{ status: "human-review" }]), "human-review");
});

test("only current verified state finalizes and stale evidence supersedes it", () => {
  assert.equal(decisionFromInterventions([{ status: "verified" }]), "finalize");
  assert.equal(decisionFromInterventions([{ status: "verified" }, { status: "stale" }]), "human-review");
  assert.equal(decisionFromInterventions([{ status: "verified" }, { status: "unresolved" }]), "human-review");
  assert.equal(
    decisionFromInterventions([
      { interventionId: "fix-auth", status: "requested" },
      { interventionId: "fix-auth", status: "repaired" },
      { interventionId: "fix-auth", status: "verified" }
    ]),
    "finalize"
  );
});
