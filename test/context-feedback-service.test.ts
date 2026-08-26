import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readApplicationContextFeedbackStats,
  readApplicationContextQualitySignals,
  submitApplicationContextFeedback
} from "../src/application/context-feedback-service.js";

test("application feedback service records locally and reports transport status", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-feedback-service-"));
  try {
    writeFileSync(path.join(root, "opencode-plusplus.config.yml"), "feedback:\n  enabled: true\n", "utf8");
    const result = await submitApplicationContextFeedback({
      repo: root,
      entryId: "official/payments",
      source: "official",
      version: "2.0.0",
      revision: 1,
      target: "entry",
      label: "useful"
    });
    assert.equal(result.enabled, true);
    assert.equal(result.transport.status, "disabled");
    assert.equal(result.stats.total, 1);
    assert.equal(readApplicationContextFeedbackStats(root, "official/payments", "official").total, 1);
    assert.equal(readApplicationContextQualitySignals(root)["official\0official/payments"], 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("disabled feedback does not write a local record", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-feedback-disabled-"));
  try {
    writeFileSync(path.join(root, "opencode-plusplus.config.yml"), "feedback:\n  enabled: false\n", "utf8");
    const result = await submitApplicationContextFeedback({
      repo: root,
      entryId: "entry",
      source: "local",
      revision: 0,
      target: "entry",
      label: "not-useful"
    });
    assert.equal(result.enabled, false);
    assert.equal(result.stats.total, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
