import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OPENCODE_PLUSPLUS_PACKAGE_VERSION } from "../src/core/package-info.js";
import { buildContextPackage } from "../src/core/context-builder.js";
import { assessDrift, assessFreshness, readContextManifest } from "../src/core/freshness.js";
import { runGit } from "../src/core/git.js";
import { writeContextPackage } from "../src/outputs/renderers/writer.js";

test("freshness is fresh after build and stale after source changes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-freshness-"));
  try {
    initRepo(root);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }), "utf8");
    writeFileSync(path.join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");
    commitAll(root, "initial");

    const context = await buildContextPackage(root);
    writeContextPackage(context);

    const freshContext = await buildContextPackage(root);
    const fresh = assessFreshness(freshContext);
    assert.equal(readContextManifest(root)?.toolVersion, OPENCODE_PLUSPLUS_PACKAGE_VERSION);
    assert.equal(fresh.status, "fresh");

    writeFileSync(path.join(root, "src", "index.ts"), "export const value = 2;\n", "utf8");
    const staleContext = await buildContextPackage(root);
    const stale = assessFreshness(staleContext);

    assert.equal(stale.status, "stale");
    assert.ok(stale.reasons.some((reason) => reason.includes("source")));
    assert.ok(stale.changedFilesSinceGeneration.includes("src/index.ts"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("drift detects modified generated outputs", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-drift-"));
  try {
    initRepo(root);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }), "utf8");
    writeFileSync(path.join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");
    commitAll(root, "initial");

    const context = await buildContextPackage(root);
    writeContextPackage(context);
    const graphPath = path.join(root, ".agent-context", "dependency-graph.md");
    writeFileSync(graphPath, `${readFileSync(graphPath, "utf8")}\nmanual edit\n`, "utf8");

    const driftContext = await buildContextPackage(root);
    const drift = assessDrift(driftContext);

    assert.equal(drift.status, "drift");
    assert.ok(drift.reasons.some((reason) => reason.includes("Generated file changed")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function initRepo(root: string): void {
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
  runGit(root, ["config", "user.name", "Repo Context"]);
}

function commitAll(root: string, message: string): void {
  runGit(root, ["add", "-A"]);
  runGit(root, ["commit", "-m", message]);
}
