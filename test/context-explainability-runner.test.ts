import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("Context explainability runner writes machine-readable and Markdown reports", () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-explainability-output-"));
  try {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/run-context-explainability-benchmark.ts", "--output-dir", outputDir], {
      cwd: path.resolve("."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const jsonPath = path.join(outputDir, "result.json");
    const markdownPath = path.join(outputDir, "result.md");
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(markdownPath), true);
    const json = JSON.parse(readFileSync(jsonPath, "utf8")) as { kind: string; sampleCount: number };
    assert.equal(json.kind, "deterministic-context-explainability");
    assert.equal(json.sampleCount, 6);
    assert.match(readFileSync(markdownPath, "utf8"), /Metric Distributions/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
