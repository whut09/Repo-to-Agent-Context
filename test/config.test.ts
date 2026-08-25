import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config/load-config.js";
import { starterConfig } from "../src/config/starter-config.js";

test("invalid target fails instead of silently falling back", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(path.join(root, "opencode-plusplus.config.yml"), "target: curser\n", "utf8");
    assert.throws(() => loadConfig(root), /Invalid target "curser"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy config without evidencePolicy remains advisory", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(path.join(root, "opencode-plusplus.config.yml"), "target: opencode\n", "utf8");
    assert.equal(loadConfig(root).evidencePolicy, "advisory");

    writeFileSync(path.join(root, "opencode-plusplus.config.yml"), "evidencePolicy: balanced\n", "utf8");
    assert.equal(loadConfig(root).evidencePolicy, "balanced");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy config keeps the context registry disabled and offline", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(path.join(root, "opencode-plusplus.config.yml"), "target: opencode\n", "utf8");
    assert.deepEqual(loadConfig(root).contextRegistry, { enabled: false, offline: true, sources: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("context registry source configuration is normalized and validated", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `
contextRegistry:
  enabled: true
  offline: false
  sources:
    - name: internal
      kind: local
      location: C:/context-packs
      trustLevel: private
`,
      "utf8"
    );
    assert.deepEqual(loadConfig(root).contextRegistry, {
      enabled: true,
      offline: false,
      sources: [{ name: "internal", kind: "local", location: "C:/context-packs", trustLevel: "private" }]
    });

    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      "contextRegistry:\n  sources:\n    - name: bad\n      kind: unknown\n      location: C:/context\n      trustLevel: private\n",
      "utf8"
    );
    assert.throws(() => loadConfig(root), /Invalid contextRegistry\.sources\[0\]\.kind/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("enabled LLM requires non-placeholder credentials", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(
      path.join(root, "opencode-plusplus.local.yml"),
      `
llm:
  enabled: true
  baseUrl: xx
  apiKey: xx
  model: xx
`,
      "utf8"
    );
    assert.throws(() => loadConfig(root), /llm\.baseUrl must be configured/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("starter config is valid and contains all output switches", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    const content = starterConfig();
    writeFileSync(path.join(root, "opencode-plusplus.config.yml"), content, "utf8");
    const config = loadConfig(root);
    assert.equal(config.target, "opencode");
    assert.deepEqual(config.agents, {
      mode: "minimal",
      maxTokens: 1200,
      include: ["commands", "safety", "entrypoints", "contextLinks"],
      manualSources: ["AGENTS.manual.md"]
    });
    assert.deepEqual(config.outputs, {
      agents: true,
      modules: true,
      graph: true,
      tasks: true,
      readiness: true,
      rag: true
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("agents config validates mode and sections", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `
agents:
  mode: maximal
`,
      "utf8"
    );
    assert.throws(() => loadConfig(root), /Invalid agents\.mode "maximal"/);

    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `
agents:
  include:
    - commands
    - everything
`,
      "utf8"
    );
    assert.throws(() => loadConfig(root), /agents\.include must be an array/);

    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `
agents:
  manualSources:
    - ""
`,
      "utf8"
    );
    assert.throws(() => loadConfig(root), /agents\.manualSources must be an array of non-empty strings/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tokenizer config supports real tokenizer modes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `
tokenizer:
  mode: cl100k_base
  model: gpt-4.1
`,
      "utf8"
    );
    const config = loadConfig(root);
    assert.equal(config.tokenizer.mode, "cl100k_base");
    assert.equal(config.tokenizer.model, "gpt-4.1");

    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `
tokenizer:
  mode: made_up
`,
      "utf8"
    );
    assert.throws(() => loadConfig(root), /tokenizer\.mode must be one of/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown output switches fail fast", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-config-"));
  try {
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      `
outputs:
  grahp: true
`,
      "utf8"
    );
    assert.throws(() => loadConfig(root), /Unknown outputs option: grahp/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
