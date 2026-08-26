import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addContextAnnotation } from "../src/context-registry/annotations.js";
import { runGit } from "../src/core/git.js";
import { writePluginHarnessSession } from "../src/integrations/opencode/plugin-runtime/harness/session.js";
import { createOpenCodePlusPlusSidecar } from "../src/integrations/opencode/plugin-runtime/index.js";

interface PluginTool {
  execute(args?: unknown): Promise<string>;
}

type ToolEnvelope<T> =
  | { ok: true; schemaVersion: string; tool: string; data: T }
  | { ok: false; schemaVersion: string; tool: string; error: { code: string; message: string } };

test("Desktop Context tools return deterministic structured data through application services", async () => {
  const root = createContextToolRepo();
  try {
    addContextAnnotation({
      repository: root,
      entryId: "private/payments",
      packageVersion: "1.0.0",
      contentRevision: 1,
      kind: "workaround",
      note: "Use the local emulator."
    });
    writePluginHarnessSession(root, {
      taskId: "payments-task",
      task: "inspect payments failures",
      type: "bugfix",
      sessionId: "desktop-session",
      updatedAt: "2026-08-26T00:00:00.000Z"
    });
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "plugin-state.json") });
    const tools = plugin.tool as Record<string, PluginTool>;

    const search = parse<{ hits: Array<{ entry: { id: string }; scoreBreakdown: Record<string, number> }> }>(
      await tools.opencode_plusplus_context_search.execute({ query: "payments", tags: ["api"] })
    );
    assert.equal(search.ok, true);
    if (!search.ok) return;
    assert.equal(search.tool, "context-search");
    assert.equal(search.data.hits[0]?.entry.id, "private/payments");
    assert.equal(typeof search.data.hits[0]?.scoreBreakdown.lexical, "number");

    const get = parse<{
      selectedFiles: string[];
      omittedFiles: string[];
      annotations?: Array<{ note: string }>;
      provenance: { verified: boolean };
    }>(await tools.opencode_plusplus_context_get.execute({ entryId: "private/payments", withAnnotations: true }));
    assert.equal(get.ok, true);
    if (!get.ok) return;
    assert.deepEqual(get.data.selectedFiles, ["docs/payments/DOC.md"]);
    assert.deepEqual(get.data.omittedFiles, ["docs/payments/references/errors.md"]);
    assert.equal(get.data.annotations?.[0]?.note, "Use the local emulator.");
    assert.equal(get.data.provenance.verified, true);

    await tools.opencode_plusplus_retrieve.execute({
      task: "inspect payments failures",
      contextId: "private/payments",
      sessionId: "desktop-session"
    });
    const status = parse<{
      taskId: string;
      selectedContext: unknown[];
      rejectedContext: unknown[];
      freshness: { status: string };
      interventions: { total: number };
    }>(await tools.opencode_plusplus_context_status.execute({ sessionId: "desktop-session" }));
    assert.equal(status.ok, true);
    if (!status.ok) return;
    assert.equal(status.data.taskId, "payments-task");
    assert.equal(status.data.freshness.status, "fresh");
    assert.equal(status.data.selectedContext.length, 1);
    assert.equal(status.data.rejectedContext.length, 0);

    const interventions = parse<{ taskId: string; events: unknown[]; summary: { total: number } }>(
      await tools.opencode_plusplus_interventions.execute({ sessionId: "desktop-session" })
    );
    assert.equal(interventions.ok, true);
    if (!interventions.ok) return;
    assert.equal(interventions.data.taskId, "payments-task");
    assert.ok(interventions.data.events.length > 0);
    assert.equal(interventions.data.summary.total, interventions.data.events.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Desktop Context tools return structured boundary errors without throwing", async () => {
  const root = createContextToolRepo();
  try {
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "plugin-state.json") });
    const tools = plugin.tool as Record<string, PluginTool>;
    const malformed = parse<never>(await tools.opencode_plusplus_context_get.execute({ full: "yes" }));
    assert.equal(malformed.ok, false);
    if (malformed.ok) return;
    assert.equal(malformed.error.code, "INVALID_ARGUMENTS");

    const traversal = parse<never>(
      await tools.opencode_plusplus_context_get.execute({ entryId: "private/payments", file: "../secret.txt" })
    );
    assert.equal(traversal.ok, false);
    if (traversal.ok) return;
    assert.equal(traversal.error.code, "INVALID_PATH");

    const missing = parse<never>(await tools.opencode_plusplus_context_get.execute({ entryId: "private/missing" }));
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.error.code, "ENTRY_NOT_FOUND");

    const interventions = parse<never>(await tools.opencode_plusplus_interventions.execute({}));
    assert.equal(interventions.ok, false);
    if (interventions.ok) return;
    assert.equal(interventions.error.code, "INVALID_ARGUMENTS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Desktop Context search returns a structured network failure", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-desktop-context-network-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      "contextRegistry:\n  enabled: true\n  offline: false\n  sources:\n    - name: unavailable\n      kind: remote\n      location: http://127.0.0.1:1/registry.json\n      trustLevel: community\n      timeoutMs: 50\n      sha256: 0000000000000000000000000000000000000000000000000000000000000000\n",
      "utf8"
    );
    const plugin = await createOpenCodePlusPlusSidecar({ directory: root }, { stateFile: path.join(root, "plugin-state.json") });
    const tools = plugin.tool as Record<string, PluginTool>;
    const result = parse<never>(await tools.opencode_plusplus_context_search.execute({ query: "payments" }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "NETWORK_FAILURE");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function parse<T>(value: string): ToolEnvelope<T> {
  return JSON.parse(value) as ToolEnvelope<T>;
}

function createContextToolRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-desktop-context-tools-"));
  const entryRoot = path.join(root, "context-packs", "docs", "payments");
  mkdirSync(path.join(entryRoot, "references"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
  writeFileSync(
    path.join(entryRoot, "DOC.md"),
    "---\nname: payments\ndescription: Payments API\nmetadata:\n  tags: api, payments\n  languages: typescript\n  versions: 1.0.0\n  revision: 1\n  updated-on: 2026-01-01\n  source: private\n---\nPayments entry.\n",
    "utf8"
  );
  writeFileSync(path.join(entryRoot, "references", "errors.md"), "Payment errors.\n", "utf8");
  writeFileSync(
    path.join(root, "opencode-plusplus.config.yml"),
    "contextRegistry:\n  enabled: true\n  offline: true\n  sources:\n    - name: private\n      kind: local\n      location: context-packs\n      trustLevel: private\n",
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
