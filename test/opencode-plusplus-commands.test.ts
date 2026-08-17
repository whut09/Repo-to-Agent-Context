import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getOpenCodePlusplusStatus, readOpenCodePlusplusReport, renderOpenCodePlusplusStatus } from "../src/cli/opencode-plusplus-commands.js";
import { verifyOpencodeSidecar, writeOpencodeSidecarLatest } from "../src/integrations/opencode/sidecar.js";

test("opencode-plusplus report reads the latest sidecar markdown report", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-opencode-plusplus-report-"));
  try {
    const reportDir = path.join(root, ".agent-context", "sidecar");
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(path.join(reportDir, "latest.md"), "# Latest\n\nready\n", "utf8");

    const report = readOpenCodePlusplusReport(root);

    assert.equal(report.exists, true);
    assert.match(report.content, /# Latest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("opencode-plusplus status reports active sidecar signals", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-opencode-plusplus-status-"));
  const oldConfigDir = process.env.OPENCODE_CONFIG_DIR;
  try {
    const configDir = path.join(root, "opencode-config");
    process.env.OPENCODE_CONFIG_DIR = configDir;
    mkdirSync(path.join(root, ".agent-context", "traces"), { recursive: true });
    mkdirSync(path.join(configDir, "plugins"), { recursive: true });
    mkdirSync(path.join(configDir, "opencode-plusplus"), { recursive: true });
    writeFileSync(path.join(configDir, "plugins", "opencode-plusplus.js"), "module.exports = async () => ({});\n", "utf8");
    writeFileSync(
      path.join(configDir, "opencode-plusplus", "state.json"),
      JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        enabled: true,
        version: "0.2.0",
        installedAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z"
      }),
      "utf8"
    );
    const verify = await verifyOpencodeSidecar(root, { pluginInstalled: true });
    writeOpencodeSidecarLatest(verify);

    const status = getOpenCodePlusplusStatus(root);

    assert.equal(status.active, true);
    assert.equal(status.pluginExists, true);
    assert.equal(status.contextExists, true);
    assert.equal(status.latestExists, true);
    assert.match(renderOpenCodePlusplusStatus(status), /Sidecar: active/);
  } finally {
    if (oldConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = oldConfigDir;
    rmSync(root, { recursive: true, force: true });
  }
});
