import assert from "node:assert/strict";
import test from "node:test";
import { pluginPerformance, runPluginStage } from "../src/integrations/opencode/plugin-runtime/harness/performance.js";

test("plugin stages return structured timeout state", async () => {
  const result = await runPluginStage(
    "retrieve",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "late";
    },
    5
  );

  assert.equal(result.status, "timeout");
  assert.ok(result.durationMs >= 5);
  const performance = pluginPerformance("retrieve", result, "miss", "rebuilt", [], ["src/unselected.ts"]);
  assert.deepEqual(
    { stage: performance.stage, status: performance.status, targetMs: performance.targetMs, rejectedFiles: performance.rejectedFiles },
    { stage: "retrieve", status: "timeout", targetMs: 3000, rejectedFiles: ["src/unselected.ts"] }
  );
});

test("plugin stages report completed duration and preserve values", async () => {
  const result = await runPluginStage("prepare", async () => "ready");
  assert.equal(result.status, "completed");
  assert.equal(result.value, "ready");
  assert.ok(result.durationMs >= 0);
});
