import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { executeOpenCodePlusplusMcpTool } from "../src/mcp/server.js";
import { planApplicationTask } from "../src/application/task-service.js";
import { testApplicationChanges } from "../src/application/verification-service.js";
import { retrieveApplicationContext } from "../src/application/retrieval-service.js";

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

    const result = await retrieveApplicationContext({ repo: root, task: "payments", provider: "static", topK: 1, language: "typescript", packageVersion: "2.0.0" });
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
