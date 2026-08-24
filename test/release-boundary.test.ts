import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("release boundary: installer only embeds Desktop plugin and native patch", () => {
  const installerCs = readFileSync(path.join(root, "src/installer/windows-installer.cs"), "utf8");
  assert.match(installerCs, /OpenCodePlusPlus\.Plugin\.gz/, "installer must embed the plugin resource");
  assert.match(installerCs, /OpenCodePlusPlus\.NativeCommandPatch\.js/, "installer must embed the native command patch");
  const resourceNames = [...installerCs.matchAll(/private const string (\w+)Resource = "([^"]+)";/g)].map((m) => m[2]);
  assert.deepEqual(resourceNames.sort(), ["OpenCodePlusPlus.NativeCommandPatch.js", "OpenCodePlusPlus.Plugin.gz"]);
  assert.doesNotMatch(installerCs, /OpenCodePlusPlus\.cli|OpenCodePlusPlus\.mcp|dist[\\/]cli|dist[\\/]mcp/, "installer must not embed CLI or MCP files");
});

test("release boundary: build-windows-installer.mjs only bundles global-plugin.ts", () => {
  const buildScript = readFileSync(path.join(root, "scripts/build-windows-installer.mjs"), "utf8");
  assert.match(buildScript, /OpenCodePlusPlusGlobalPlugin/, "build script must import global-plugin.ts");
  const embeddedResources = [...buildScript.matchAll(/\/resource:[^",]+,(OpenCodePlusPlus\.\w+\.gz|OpenCodePlusPlus\.\w+\.js)/g)].map((m) => m[1]);
  assert.deepEqual(
    embeddedResources.sort(),
    ["OpenCodePlusPlus.NativeCommandPatch.js", "OpenCodePlusPlus.Plugin.gz"],
    "build must embed exactly plugin + native patch"
  );
  assert.doesNotMatch(buildScript, /src[\\/]cli[\\/]|src[\\/]mcp[\\/]/, "build script must not reference CLI or MCP");
});

test("release boundary: global-plugin.ts imports only plugin-runtime", () => {
  const globalPlugin = readFileSync(path.join(root, "src/integrations/opencode/global-plugin.ts"), "utf8");
  assert.match(globalPlugin, /from "\.\/plugin-runtime/, "global-plugin must import from plugin-runtime");
  assert.doesNotMatch(globalPlugin, /from "\.\/cli|from "\.\/mcp|from "\.\/cli-runner/, "global-plugin must not import CLI or MCP");
});

test("release boundary: npm package files whitelist excludes release and build artifacts", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(
    pkg.files.some((f: string) => f.includes("README.md")),
    "package must include README"
  );
  assert.ok(
    pkg.files.some((f: string) => f.includes("opencode-plusplus.config.example.yml")),
    "package must include config example"
  );
  assert.ok(
    pkg.files.some((f: string) => f.includes("dist/")),
    "package must include dist runtime output"
  );
  assert.ok(!pkg.files.some((f: string) => f.includes("release/")), "package must not include release/");
  assert.ok(!pkg.files.some((f: string) => f.includes(".installer-build/")), "package must not include installer build");
  assert.ok(!pkg.files.some((f: string) => f.includes("node_modules/")), "package must not include node_modules");
  assert.ok(!pkg.files.some((f: string) => f.includes(".agent-context/")), "package must not include .agent-context");
  assert.ok(!pkg.files.some((f: string) => f.includes("docs/")), "package must not include docs/ (only for build-time)");
  assert.ok(!pkg.files.some((f: string) => f.includes("apps/desktop/")), "package must not include apps/desktop/");
});

test("release boundary: Desktop verification covers executable integrity and plugin loading", () => {
  const verifier = readFileSync(path.join(root, "scripts/verify-release.mjs"), "utf8");
  assert.match(verifier, /opencode-plusplus-release\.json/);
  assert.match(verifier, /createHash\("sha256"\)/);
  assert.match(verifier, /manifest\.installer\.maximumBytes/);
  assert.match(verifier, /pathToFileURL\(pluginBundle\)/);
  assert.match(verifier, /pluginExports\.length !== 1/);
  assert.match(verifier, /OPENCODE_PLUSPLUS_NATIVE_COMMANDS/);
  for (const command of ["opencode-plusplus-status", "opencode-plusplus-on", "opencode-plusplus-off"]) {
    assert.match(verifier, new RegExp(command));
  }
});

test("release boundary: PR CI uses Windows Desktop gates without paid executors", () => {
  const ci = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /windows-latest/);
  assert.match(ci, /npm run build:installer:windows/);
  assert.match(ci, /npm run benchmark:desktop/);
  assert.doesNotMatch(ci, /benchmark:agent:real|OPENCODE_EXECUTOR_COMMAND|CLAUDE|CODEX|MIMO/i);

  const desktopSmoke = readFileSync(path.join(root, ".github", "workflows", "desktop-smoke.yml"), "utf8");
  assert.match(desktopSmoke, /workflow_dispatch/);
  assert.match(desktopSmoke, /SST\.OpenCodeDesktop/);
  assert.match(desktopSmoke, /--require-real-desktop-launch/);

  const desktopRelease = readFileSync(path.join(root, ".github", "workflows", "desktop-release.yml"), "utf8");
  assert.match(desktopRelease, /SST\.OpenCodeDesktop/);
  assert.match(desktopRelease, /npm run test:desktop:real/);
  assert.match(desktopRelease, /Release tag \$env:RELEASE_TAG must match package\.json version v\$version/);
  assert.match(desktopRelease, /docs\/releases\/\$\{env:RELEASE_TAG\}\.zh-CN\.md/);
  assert.match(desktopRelease, /--notes-file \$notes/);
  assert.doesNotMatch(desktopRelease, /--generate-notes/);
  assert.doesNotMatch(desktopRelease, /benchmark:agent:real|OPENCODE_EXECUTOR_COMMAND|CLAUDE|CODEX|MIMO/i);
});

test("release boundary: Desktop version comes only from package.json", () => {
  const buildScript = readFileSync(path.join(root, "scripts", "build-windows-installer.mjs"), "utf8");
  const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version as string;
  assert.match(buildScript, /JSON\.parse\(readFileSync\(path\.join\(root, "package\.json"\)/);
  assert.match(buildScript, /replaceAll\("__PACKAGE_VERSION__", packageVersion\)/);
  assert.match(buildScript, /version: packageVersion/);
  assert.doesNotMatch(buildScript, new RegExp(packageVersion.replaceAll(".", "\\.")));
});
