import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { executeOpenCodePlusplusMcpTool } from "../src/mcp/server.js";
import { planApplicationTask } from "../src/application/task-service.js";
import { testApplicationChanges } from "../src/application/verification-service.js";
import { retrieveApplicationContext } from "../src/application/retrieval-service.js";
import { getContextFiles, getContextEntry, searchContextEntries } from "../src/application/context-service.js";
import { addContextAnnotation } from "../src/context-registry/annotations.js";

test("MCP task and verification tools use the shared application services", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-application-services-"));
  try {
    mkdirSync(path.join(root, ".git"));
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }), "utf8");
    writeFileSync(path.join(root, "src", "main.ts"), "export const main = true;\n", "utf8");

    const directPlan = await planApplicationTask({ repo: root, task: "inspect main" });
    const mcpPlan = await executeOpenCodePlusplusMcpTool("opencode_plusplus_plan", { repo: root, task: "inspect main" });
    assert.equal(mcpPlan.markdown, directPlan.markdown);
    assert.equal(mcpPlan.task, "inspect main");

    const directTests = await testApplicationChanges({ repo: root, base: "main" });
    const mcpTests = await executeOpenCodePlusplusMcpTool("opencode_plusplus_tests", { repo: root, base: "main" });
    assert.equal(mcpTests.markdown, directTests.markdown);
    assert.deepEqual(mcpTests.minimalCommands, directTests.minimalCommands);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retrieval application service includes configured local registry context", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-application-registry-"));
  try {
    mkdirSync(path.join(root, ".git"));
    mkdirSync(path.join(root, "src"), { recursive: true });
    mkdirSync(path.join(root, "context packs", "official", "docs", "payments", "references"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }), "utf8");
    writeFileSync(path.join(root, "src", "main.ts"), "export const main = true;\n", "utf8");
    writeFileSync(
      path.join(root, "context packs", "official", "docs", "payments", "DOC.md"),
      `---\nname: payments\ndescription: Payment API session handling reference\nmetadata:\n  languages: typescript\n  versions: 2.0.0\n  revision: 1\n  updated-on: 2026-01-01\n  source: official\n  tags: payments,session\n---\nPayment session guidance.\n`,
      "utf8"
    );
    writeFileSync(path.join(root, "context packs", "official", "docs", "payments", "references", "errors.md"), "Payment errors\n", "utf8");
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `contextRegistry:\n  enabled: true\n  offline: true\n  sources:\n    - name: official\n      kind: local\n      location: context packs\n      trustLevel: official\n`,
      "utf8"
    );

    const result = await retrieveApplicationContext({
      repo: root,
      task: "payments",
      provider: "static",
      topK: 1,
      language: "typescript",
      packageVersion: "2.0.0"
    });
    const registryHit = result.hits.find((hit) => hit.metadata.contextSource === "official");
    assert.ok(registryHit);
    assert.deepEqual(registryHit.mustInspect, ["context://official/official/docs/payments/DOC.md"]);
    assert.ok(result.relatedFiles.some((file) => file.endsWith("references/errors.md")));
    assert.ok(result.rejectedFiles.includes("src/main.ts"));
    assert.equal(result.registry?.valid, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("context application services search entries and fetch entry, file, and full modes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-fetch-"));
  try {
    mkdirSync(path.join(root, ".git"));
    const entryRoot = path.join(root, "context packs", "official", "docs", "payments");
    mkdirSync(path.join(entryRoot, "references"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }), "utf8");
    writeFileSync(path.join(root, "src.ts"), "export const source = true;\n", "utf8");
    writeFileSync(
      path.join(entryRoot, "DOC.md"),
      `---\nname: payments\ndescription: Payment API reference\nmetadata:\n  languages: typescript\n  versions: 2.0.0\n  revision: 2\n  updated-on: 2026-01-01\n  source: official\n  tags: payments, api\n---\nPayment entry guidance.\n`,
      "utf8"
    );
    writeFileSync(path.join(entryRoot, "references", "errors.md"), "Payment error guidance.\n", "utf8");
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `contextRegistry:\n  enabled: true\n  offline: true\n  sources:\n    - name: official\n      kind: local\n      location: context packs\n      trustLevel: official\n`,
      "utf8"
    );

    const search = await searchContextEntries({ repo: root, query: "payments", topK: 1 });
    assert.equal(search.entries[0]?.id, "official/payments");
    assert.equal(search.hits[0]?.entry.id, "official/payments");
    assert.ok((search.hits[0]?.score ?? 0) > 0);
    assert.equal(typeof search.hits[0]?.scoreBreakdown.lexical, "number");
    const entry = await getContextEntry({ repo: root, id: "official/payments" });
    assert.equal(entry.entry.contentRevision, 2);
    addContextAnnotation({ repository: root, entryId: entry.entry.id, packageVersion: "2.0.0", contentRevision: 2, kind: "workaround", note: "Use the current retry helper." });

    const main = await getContextFiles({ repo: root, id: entry.entry.id });
    assert.deepEqual(main.selectedFiles, ["official/docs/payments/DOC.md"]);
    assert.deepEqual(main.omittedFiles, ["official/docs/payments/references/errors.md"]);
    assert.equal(main.files?.[0]?.content, "Payment entry guidance.\n");
    assert.equal(main.fetchMode, "entry");
    assert.equal(main.contextMode, "rebuilt");

    const hit = await getContextFiles({ repo: root, id: entry.entry.id });
    assert.equal(hit.cache.status, "hit");
    assert.equal(hit.contextMode, "reused");

    const file = await getContextFiles({ repo: root, id: entry.entry.id, file: "official/docs/payments/references/errors.md" });
    assert.deepEqual(file.selectedFiles, ["official/docs/payments/references/errors.md"]);
    assert.equal(file.files?.[0]?.content, "Payment error guidance.\n");
    assert.equal(file.fetchMode, "file");

    const full = await getContextFiles({ repo: root, id: entry.entry.id, full: true });
    assert.equal(full.fetchMode, "full");
    assert.equal(full.files?.length, 2);
    assert.deepEqual(full.omittedFiles, []);
    assert.equal(full.annotations, undefined);
    const annotated = await getContextFiles({ repo: root, id: entry.entry.id, withAnnotations: true });
    assert.equal(annotated.annotations?.[0]?.note, "Use the current retry helper.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("context fetch revalidates freshness after a working tree change", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-stale-"));
  try {
    mkdirSync(path.join(root, ".git"));
    const entryRoot = path.join(root, "packs", "docs", "payments");
    mkdirSync(entryRoot, { recursive: true });
    writeFileSync(path.join(root, "package.json"), "{}\n", "utf8");
    writeFileSync(
      path.join(entryRoot, "DOC.md"),
      "---\nname: payments\ndescription: Payments\nmetadata:\n  languages: typescript\n  versions: 1.0.0\n  revision: 1\n  updated-on: 2026-01-01\n  source: private\n---\nOriginal\n",
      "utf8"
    );
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      "contextRegistry:\n  enabled: true\n  offline: true\n  sources:\n    - name: local\n      kind: local\n      location: packs\n      trustLevel: private\n",
      "utf8"
    );

    const first = await getContextFiles({ repo: root, id: "local/payments" });
    writeFileSync(path.join(root, "changed.ts"), "export const changed = true;\n", "utf8");
    const second = await getContextFiles({ repo: root, id: "local/payments" });
    assert.equal(second.freshness?.status, "fresh");
    assert.match(second.freshness?.reason ?? "", /working tree|context source changed/i);
    assert.equal(second.contextMode, "incremental");
    assert.notEqual(first.freshness?.workingTreeHash, second.freshness?.workingTreeHash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("context fetch rejects traversal and unavailable companion files", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-path-"));
  try {
    mkdirSync(path.join(root, ".git"));
    const entryRoot = path.join(root, "packs", "docs", "payments");
    mkdirSync(entryRoot, { recursive: true });
    writeFileSync(path.join(root, "package.json"), "{}\n", "utf8");
    writeFileSync(
      path.join(entryRoot, "DOC.md"),
      "---\nname: payments\ndescription: Payments\nmetadata:\n  languages: typescript\n  versions: 1.0.0\n  revision: 1\n  updated-on: 2026-01-01\n  source: private\n---\nOriginal\n",
      "utf8"
    );
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      "contextRegistry:\n  enabled: true\n  offline: true\n  sources:\n    - name: private\n      kind: local\n      location: packs\n      trustLevel: private\n",
      "utf8"
    );
    await assert.rejects(() => getContextFiles({ repo: root, id: "private/payments", file: "../secret.md" }), /normalized relative path|not available/i);
    await assert.rejects(() => getContextFiles({ repo: root, id: "private/payments", file: "missing.md" }), /not available/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
