import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { executeOpenCodePlusplusMcpTool } from "../src/mcp/server.js";
import { planApplicationTask } from "../src/application/task-service.js";
import { testApplicationChanges } from "../src/application/verification-service.js";

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
