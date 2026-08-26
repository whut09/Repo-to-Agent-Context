import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runContextFeedbackTool, runContextGetTool, runContextSearchTool, runContextStatusTool } from "../src/application/context-tools-service.js";
import { recordContextUsage } from "../src/context-registry/usage-ledger.js";
import { getContextFiles } from "../src/application/context-service.js";
import { runGit } from "../src/core/git.js";

test("Context tool application service returns structured search and get results", async () => {
  const root = createRegistryRepo();
  try {
    const search = await runContextSearchTool({ repo: root, query: "payments" });
    assert.equal(search.ok, true);
    if (!search.ok) return;
    assert.equal(search.tool, "context-search");
    assert.equal(search.data.hits[0]?.entry.id, "private/payments");
    assert.equal(typeof search.data.hits[0]?.scoreBreakdown.lexical, "number");

    const get = await runContextGetTool({ repo: root, id: "private/payments" });
    assert.equal(get.ok, true);
    if (!get.ok) return;
    assert.equal(get.tool, "context-get");
    assert.deepEqual(get.data.selectedFiles, ["docs/payments/DOC.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Context status separates current and stale usage", async () => {
  const root = createRegistryRepo();
  try {
    const fetched = await getContextFiles({ repo: root, id: "private/payments" });
    recordContextUsage(root, "payments-task", fetched);
    const fresh = await runContextStatusTool({ repo: root, taskId: "payments-task" });
    assert.equal(fresh.ok, true);
    if (!fresh.ok) return;
    assert.equal(fresh.data.freshness.status, "fresh");
    assert.equal(fresh.data.selectedContext.length, 1);

    writeFileSync(path.join(root, "src.ts"), "export const changed = true;\n", "utf8");
    const stale = await runContextStatusTool({ repo: root, taskId: "payments-task" });
    assert.equal(stale.ok, true);
    if (!stale.ok) return;
    assert.equal(stale.data.freshness.status, "stale");
    assert.equal(stale.data.selectedContext.length, 0);
    assert.deepEqual(stale.data.rejectedContext[0]?.reasons, ["working-tree-changed"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Context get maps unknown entries and path traversal to stable errors", async () => {
  const root = createRegistryRepo();
  try {
    const missing = await runContextGetTool({ repo: root, id: "missing" });
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.error.code, "ENTRY_NOT_FOUND");

    const traversal = await runContextGetTool({ repo: root, id: "private/payments", file: "../secret.txt" });
    assert.equal(traversal.ok, false);
    if (traversal.ok) return;
    assert.equal(traversal.error.code, "INVALID_PATH");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Context feedback uses the shared structured tool envelope", async () => {
  const root = createRegistryRepo();
  try {
    const result = await runContextFeedbackTool({
      repo: root,
      entryId: "private/payments",
      source: "private",
      revision: 1,
      target: "entry",
      label: "useful"
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.tool, "context-feedback");
    assert.equal(result.data.annotationSeparate, true);
    assert.equal(result.data.evidenceAuthority, false);
    assert.equal(result.data.stats.total, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Context search reports an unavailable remote registry as a retryable network failure", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-network-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      "contextRegistry:\n  enabled: true\n  offline: false\n  sources:\n    - name: unavailable\n      kind: remote\n      location: http://127.0.0.1:1/registry.json\n      trustLevel: community\n      timeoutMs: 50\n      sha256: 0000000000000000000000000000000000000000000000000000000000000000\n",
      "utf8"
    );
    const result = await runContextSearchTool({ repo: root, query: "anything" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "NETWORK_FAILURE");
    assert.equal(result.error.retryable, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRegistryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-tools-"));
  const entryRoot = path.join(root, "packs", "docs", "payments");
  mkdirSync(path.join(entryRoot, "references"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
  writeFileSync(
    path.join(entryRoot, "DOC.md"),
    "---\nname: payments\ndescription: Payments API\nmetadata:\n  languages: typescript\n  versions: 1.0.0\n  revision: 1\n  updated-on: 2026-01-01\n  source: private\n---\nPayments.\n",
    "utf8"
  );
  writeFileSync(path.join(entryRoot, "references", "errors.md"), "Errors.\n", "utf8");
  writeFileSync(
    path.join(root, "opencode-plusplus.config.yml"),
    "contextRegistry:\n  enabled: true\n  offline: true\n  sources:\n    - name: private\n      kind: local\n      location: packs\n      trustLevel: private\n",
    "utf8"
  );
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "test@example.com"]);
  runGit(root, ["config", "user.name", "Test"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  return root;
}
