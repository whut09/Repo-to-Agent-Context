import assert from "node:assert/strict";
import test from "node:test";
import { assessExternalContextPolicy } from "../src/harness/knowledge/context-policy.js";
import type { ContextUsageRecord } from "../src/context-registry/types.js";

test("latest fresh Context usage supersedes stale usage for the same entry", () => {
  const stale = usage("old", "tree-old", "2026-08-26T00:00:00.000Z");
  const fresh = usage("new", "tree-current", "2026-08-26T01:00:00.000Z");
  const assessment = assessExternalContextPolicy(".", { records: [stale, fresh], currentWorkingTreeHash: "tree-current" });
  assert.equal(assessment.records.length, 1);
  assert.equal(assessment.records[0]?.usageId, "new");
  assert.equal(
    assessment.findings.some((finding) => finding.status === "blocked"),
    false
  );
});

test("stale Context blocks while trust remains non-authoritative", () => {
  const record = usage("stale", "tree-old", "2026-08-26T00:00:00.000Z");
  const assessment = assessExternalContextPolicy(".", { records: [record], currentWorkingTreeHash: "tree-current" });
  assert.ok(assessment.findings.some((finding) => finding.id.startsWith("context.external-stale") && finding.status === "blocked"));
  assert.equal(assessment.provenance[0]?.sourceTrustLevel, "official");
  assert.equal(assessment.authority.evidenceAuthority, false);
  assert.equal(assessment.authority.finalizeAuthority, false);
});

test("Context intervention explanation separates adopted and rejected suggestions", () => {
  const assessment = assessExternalContextPolicy(".", { records: [usage("one", "tree", "2026-08-26T00:00:00.000Z")], currentWorkingTreeHash: "tree" });
  assert.equal(assessment.intervention.adoptedSuggestions.length, 1);
  assert.equal(assessment.intervention.rejectedSuggestions.length, 2);
  assert.ok(assessment.intervention.rejectedSuggestions.every((item) => item.reason.length > 0));
});

function usage(usageId: string, workingTreeHash: string, fetchedAt: string): ContextUsageRecord {
  return {
    schemaVersion: 1,
    usageId,
    taskId: "task",
    fetchedAt,
    workingTreeHash,
    entryId: "official/sdk",
    entryName: "sdk",
    packageVersion: "2.0.0",
    contentRevision: 1,
    selectedFiles: ["DOC.md"],
    omittedFiles: [],
    provenance: {
      schemaVersion: 1,
      revision: 1,
      sourceName: "official",
      sourceTrustLevel: "official",
      entryId: "official/sdk",
      packageVersion: "2.0.0",
      contentRevision: 1,
      contentHash: "a".repeat(64),
      verified: true
    },
    freshness: { status: "fresh", workingTreeHash, checkedAt: fetchedAt },
    cache: { status: "hit", stale: false },
    versionCompatibility: { status: "match", contextVersion: "2.0.0", repositoryVersion: "2.0.0", reason: "match" },
    advice: [
      { id: "adopted", kind: "file-location", disposition: "adopted", summary: "Locate DOC.md", reason: "selected" },
      { id: "command", kind: "command", disposition: "rejected", summary: "npm test", reason: "no command authority", suggestedCommand: "npm test" },
      { id: "claim", kind: "evidence-claim", disposition: "rejected", summary: "tests passed", reason: "no evidence authority" }
    ],
    authority: {
      commandAuthority: false,
      evidenceAuthority: false,
      contractAuthority: false,
      freshnessAuthority: false,
      forbiddenPathAuthority: false,
      finalizeAuthority: false
    }
  };
}
