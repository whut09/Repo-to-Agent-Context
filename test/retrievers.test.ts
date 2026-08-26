import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildContextPackage } from "../src/core/context-builder.js";
import { adaptiveTopK } from "../src/retrievers/types.js";
import { createContextRetriever, renderContextHits } from "../src/retrievers/index.js";
import { negativeExamplePenalty } from "../src/retrievers/static.js";
import { ContextRegistryRetriever } from "../src/retrievers/context-registry.js";
import { hashContextText } from "../src/context-registry/index.js";
import type { ContextEntry } from "../src/context-registry/types.js";

function createRetrieverRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-retriever-"));
  mkdirSync(path.join(root, "src", "auth"), { recursive: true });
  mkdirSync(path.join(root, "src", "billing"), { recursive: true });
  mkdirSync(path.join(root, "test", "auth"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test", check: "tsc --noEmit" } }), "utf8");
  writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function refreshSessionTimeout() { return 'session timeout'; }\n", "utf8");
  writeFileSync(
    path.join(root, "src", "auth", "middleware.ts"),
    "import { refreshSessionTimeout } from './session.js';\nexport function authMiddleware() { return refreshSessionTimeout(); }\n",
    "utf8"
  );
  writeFileSync(path.join(root, "src", "billing", "invoice.ts"), "export function invoiceTotal() { return 42; }\n", "utf8");
  writeFileSync(
    path.join(root, "test", "auth", "session.test.ts"),
    "import { refreshSessionTimeout } from '../../src/auth/session.js';\nrefreshSessionTimeout();\n",
    "utf8"
  );
  return root;
}

test("static retriever returns task-relevant context hits", async () => {
  const root = createRetrieverRepo();
  try {
    const context = await buildContextPackage(root);
    const retriever = createContextRetriever(context, "static");
    const hits = await retriever.search("fix session timeout", { topK: 5, includeTests: true });

    assert.ok(hits.some((hit) => hit.path === "src/auth/session.ts"));
    assert.ok(hits.every((hit) => hit.source === "static"));
    assert.ok(hits[0].score >= hits[hits.length - 1].score);

    const markdown = renderContextHits("fix session timeout", "static", hits);
    assert.match(markdown, /# Context Retrieval/);
    assert.match(markdown, /src\/auth\/session\.ts/);
    assert.match(markdown, /Signals: lexical=/);
    assert.match(markdown, /Must inspect:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hybrid retriever merges static and ripgrep protocol hits", async () => {
  const root = createRetrieverRepo();
  try {
    const context = await buildContextPackage(root);
    const retriever = createContextRetriever(context, "hybrid");
    const hits = await retriever.search("session timeout", { topK: 5, includeTests: true, changedFiles: ["src/auth/session.ts"] });

    assert.ok(hits.some((hit) => hit.path === "src/auth/session.ts"));
    assert.ok(hits.every((hit) => hit.source === "hybrid"));
    assert.ok(hits.some((hit) => Array.isArray(hit.metadata.sources)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CodeGraph retriever falls back when no CodeGraph project exists", async () => {
  const root = createRetrieverRepo();
  try {
    const context = await buildContextPackage(root);
    const retriever = createContextRetriever(context, "codegraph");
    const hits = await retriever.search("session timeout", { topK: 5, includeTests: true });

    assert.ok(hits.some((hit) => hit.path === "src/auth/session.ts"));
    assert.ok(hits.some((hit) => typeof hit.metadata.codegraphFallbackReason === "string"));

    const markdown = renderContextHits("session timeout", "codegraph", hits);
    assert.match(markdown, /Fallback: No \.codegraph directory detected/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("external retriever protocols fail with adapter guidance", async () => {
  const root = createRetrieverRepo();
  try {
    const context = await buildContextPackage(root);
    const retriever = createContextRetriever(context, "lightrag");
    await assert.rejects(() => retriever.search("session timeout", { topK: 3 }), /requires an external service adapter/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adaptive top-k follows task type", () => {
  assert.equal(adaptiveTopK("bugfix"), 6);
  assert.equal(adaptiveTopK("feature"), 8);
  assert.equal(adaptiveTopK("refactor"), 10);
  assert.equal(adaptiveTopK("auto"), 8);
  assert.equal(adaptiveTopK("bugfix", 3), 3);
});

test("static retrieval exposes symbol and dependency-chain signals", async () => {
  const root = createRetrieverRepo();
  try {
    const context = await buildContextPackage(root);
    const retriever = createContextRetriever(context, "static");
    const hits = await retriever.search("refresh session timeout", {
      topK: 8,
      changedFiles: ["src/auth/session.ts"],
      includeTests: true
    });
    const middleware = hits.find((hit) => hit.path === "src/auth/middleware.ts");
    assert.ok(middleware);
    assert.ok((middleware.metadata.scoreBreakdown?.dependencyChain ?? 0) > 0);
    assert.ok((hits.find((hit) => hit.path === "src/auth/session.ts")?.metadata.scoreBreakdown?.symbol ?? 0) > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit negative examples are strongly down-ranked", () => {
  assert.equal(negativeExamplePenalty("examples/session.ts", "fixture", "fix session", ["examples"]), 40);
  assert.equal(negativeExamplePenalty("examples/session.ts", "fixture", "fix examples/session.ts", ["examples"]), 0);
});

function registryEntry(sourceName: string, name: string, overrides: Partial<ContextEntry> = {}): ContextEntry {
  const contentHash = hashContextText(`${sourceName}:${name}`);
  return {
    schemaVersion: 1,
    revision: 0,
    id: `${sourceName}/${name}`,
    canonicalId: name,
    name,
    description: `${name} API reference for session timeout handling`,
    kind: "doc",
    tags: ["api", "session"],
    language: "typescript",
    packageVersion: "2.0.0",
    contentRevision: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceName,
    trustLevel: sourceName === "official" ? "official" : "community",
    files: [{ schemaVersion: 1, revision: 0, path: "DOC.md", role: "entry", contentHash, sizeBytes: 1, updatedAt: "2026-01-01T00:00:00.000Z" }],
    contentHash,
    provenance: {
      schemaVersion: 1,
      revision: 0,
      sourceName,
      sourceTrustLevel: sourceName === "official" ? "official" : "community",
      entryId: `${sourceName}/${name}`,
      packageVersion: "2.0.0",
      contentRevision: 2,
      contentHash,
      verified: false
    },
    symbols: ["refreshSessionTimeout"],
    dependencyChain: ["authMiddleware"],
    qualityScore: 8,
    ...overrides
  };
}

test("registry retrieval supports exact ID, fuzzy search, empty query, filters, and explanations", async () => {
  const retriever = new ContextRegistryRetriever([
    registryEntry("official", "session-timeout"),
    registryEntry("community", "billing"),
    registryEntry("official", "session-other", { language: "python", packageVersion: "1.0.0", tags: ["other"] })
  ]);
  const exact = await retriever.search("official/session-timeout", { topK: 3, tags: ["session"], language: "typescript", packageVersion: "2.0.0" });
  assert.equal(exact[0]?.id, "official/session-timeout");
  assert.equal(exact[0]?.metadata.scoreBreakdown?.exactId, 1000);
  assert.ok(
    exact[0]?.metadata.scoreBreakdown &&
      ["lexical", "symbol", "dependency", "source", "quality", "regression", "negativePenalty"].every((key) => key in exact[0]!.metadata.scoreBreakdown!)
  );
  assert.deepEqual(exact[0]?.mustInspect, ["context://official/DOC.md"]);

  const listed = await retriever.search("", { topK: 10 });
  assert.equal(listed.length, 3);
  assert.equal(listed[0]?.metadata.contextTrustLevel, "official");
  const filtered = await retriever.search("billing", { topK: 10, source: "community" });
  assert.deepEqual(
    filtered.map((hit) => hit.id),
    ["community/billing"]
  );
});

test("registry retrieval is stable for equal scores and applies negative penalty", async () => {
  const retriever = new ContextRegistryRetriever([
    registryEntry("community", "zeta", { qualityScore: 0 }),
    registryEntry("community", "alpha", { qualityScore: 0 })
  ]);
  const listed = await retriever.search("", { topK: 10 });
  assert.deepEqual(
    listed.map((hit) => hit.id),
    ["community/alpha", "community/zeta"]
  );
  const penalized = await retriever.search("session", { topK: 10, negativeExamples: ["community/alpha"] });
  assert.equal(penalized.at(-1)?.id, "community/alpha");
  assert.equal(penalized.at(-1)?.metadata.scoreBreakdown?.negativePenalty, 40);
});

test("local feedback quality is opt-in, bounded, and cannot override exact ID", async () => {
  const retriever = new ContextRegistryRetriever([registryEntry("community", "alpha", { qualityScore: 0 }), registryEntry("community", "zeta", { qualityScore: 0 })]);
  const baseline = await retriever.search("", { topK: 10 });
  assert.deepEqual(baseline.map((hit) => hit.id), ["community/alpha", "community/zeta"]);
  assert.equal(baseline[0]?.metadata.scoreBreakdown?.localFeedback, 0);
  const weighted = await retriever.search("", { topK: 10, localQualitySignals: { "community\0community/zeta": 50 } });
  assert.equal(weighted[0]?.id, "community/zeta");
  assert.equal(weighted[0]?.metadata.scoreBreakdown?.localFeedback, 3);
  const exact = await retriever.search("community/alpha", { topK: 10, localQualitySignals: { "community\0community/zeta": 50, "community\0community/alpha": -50 } });
  assert.equal(exact[0]?.id, "community/alpha");
});

test("registry retrieval reports useful precision and recall at top K", async () => {
  const retriever = new ContextRegistryRetriever([
    registryEntry("official", "session-timeout"),
    registryEntry("official", "session-auth"),
    registryEntry("community", "billing"),
    registryEntry("community", "unrelated", { tags: ["unrelated"] })
  ]);
  const expected = new Set(["official/session-timeout", "official/session-auth"]);
  const hits = await retriever.search("session", { topK: 2 });
  const selected = new Set(hits.map((hit) => hit.id));
  const truePositives = [...selected].filter((id) => expected.has(id)).length;
  assert.equal(truePositives, 2);
  assert.equal(truePositives / selected.size, 1);
  assert.equal(truePositives / expected.size, 1);
});
