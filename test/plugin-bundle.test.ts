import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES } from "../src/integrations/opencode/plugin-runtime/harness/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "constants",
  "crypto",
  "diagnostics_channel",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "test",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib"
]);

// The bundled TypeScript library keeps a guarded lazy `require("source-map-support")`
// behind try/catch. It is never executed during module load or normal harness use.
const OPTIONAL_LAZY_REQUIRES = new Set(["source-map-support"]);

test("Desktop plugin bundle builds, loads standalone, and stays repository-independent", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-bundle-"));
  const bundleFile = path.join(dir, "opencode-plusplus-plugin.cjs");
  try {
    const bundleCode = await buildPluginBundle();

    for (const specifier of bundleRequireSpecifiers(bundleCode)) {
      assert.ok(
        specifier.startsWith("node:") ||
          specifier.startsWith(".") ||
          specifier.startsWith("/") ||
          NODE_BUILTINS.has(specifier) ||
          OPTIONAL_LAZY_REQUIRES.has(specifier),
        `bundle must not require external node_modules package: ${specifier}`
      );
    }
    assert.equal(bundleCode.includes(root), false, "bundle must not embed the repository absolute path");
    assert.equal(bundleCode.includes(root.replace(/\\/g, "/")), false, "bundle must not embed a normalized repository absolute path");

    writeFileSync(bundleFile, bundleCode, "utf8");
    const loaded = await import(`${pathToFileURL(bundleFile).href}?build=${Date.now()}`);
    const exports = [...new Set(Object.values(loaded))];
    assert.equal(exports.length, 1);
    assert.equal(typeof exports[0], "function");
    const pluginFactory = exports[0] as (context: unknown) => Promise<Record<string, unknown>>;

    const plugin = await pluginFactory({ directory: dir, worktree: dir });
    const tools = plugin.tool as Record<string, unknown>;
    assert.deepEqual(Object.keys(tools).sort(), [...OPENCODE_PLUSPLUS_PLUGIN_TOOL_NAMES].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Desktop plugin bundle build is independent of the CLI and MCP entry points", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-plugin-build-"));
  try {
    const bundleCode = await buildPluginBundle();
    assert.doesNotMatch(bundleCode, /@modelcontextprotocol/, "plugin bundle must not embed the MCP SDK");
    assert.doesNotMatch(bundleCode, /runOpenCodePlusPlusCli/, "plugin bundle must not spawn the OpenCode++ CLI");
    assert.doesNotMatch(bundleCode, /dist[\\/]cli[\\/]index/, "plugin bundle must not reference the CLI entry");
    assert.ok(bundleCode.includes("opencode-plusplus-sidecar"), "bundle must contain the sidecar runtime");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function buildPluginBundle(): Promise<string> {
  const result = await build({
    stdin: {
      contents:
        'import { OpenCodePlusPlusGlobalPlugin } from "./src/integrations/opencode/global-plugin.ts";\n' + "module.exports = OpenCodePlusPlusGlobalPlugin;\n",
      resolveDir: root,
      sourcefile: "opencode-plusplus-plugin-entry.ts",
      loader: "ts"
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    write: false,
    minify: true,
    legalComments: "none"
  });
  return result.outputFiles[0]!.text;
}

function bundleRequireSpecifiers(code: string): string[] {
  return [...code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
}
