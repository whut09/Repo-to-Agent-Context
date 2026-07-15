import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = process.argv.includes("--all") ? ["core", "desktop"] : [valueAfter("--package") ?? "core"];

for (const target of targets) verifyPackage(target);

function verifyPackage(target) {
  const config =
    target === "desktop"
      ? {
          directory: path.join(root, "apps", "desktop"),
          maximumBytes: 500_000,
          maximumFiles: 10,
          required: ["package.json", "dist/main/main.js", "dist/main/preload.cjs", "dist/renderer/index.html"],
          forbiddenPrefixes: ["src/", "node_modules/"]
        }
      : {
          directory: root,
          maximumBytes: 500_000,
          maximumFiles: 200,
          required: ["package.json", "dist/cli/index.js", "dist/mcp/server.js", "dist/core/package-info.generated.js"],
          forbiddenPrefixes: ["assets/", "benchmarks/", "apps/desktop/", ".agent-context/"]
        };
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is required; run this check through npm run release:verify.");
  const result = spawnSync(process.execPath, [npmCli, "pack", config.directory, "--json", "--dry-run", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`npm pack failed for ${target}: ${result.stderr || result.stdout}`);
  const report = JSON.parse(result.stdout)[0];
  const paths = new Set(report.files.map((file) => file.path));
  for (const required of config.required) if (!paths.has(required)) throw new Error(`${target} package is missing required file: ${required}`);
  for (const file of paths) {
    if (config.forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) throw new Error(`${target} package contains forbidden file: ${file}`);
  }
  if (report.size > config.maximumBytes) throw new Error(`${target} package is ${report.size} bytes; maximum is ${config.maximumBytes}.`);
  if (report.entryCount > config.maximumFiles) throw new Error(`${target} package has ${report.entryCount} files; maximum is ${config.maximumFiles}.`);
  if (target === "core") verifyBins(config.directory, report.files);
  if (target === "desktop") verifyDesktopMain(config.directory);
  verifyManifestVersion(config.directory, report.version);
  console.log(`${target}: ${report.entryCount} files, ${formatBytes(report.size)} packed, ${formatBytes(report.unpackedSize)} unpacked`);
}

function verifyManifestVersion(directory, packedVersion) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  if (manifest.version !== packedVersion) throw new Error(`Packed version ${packedVersion} does not match manifest ${String(manifest.version)}.`);
  if (directory === root) {
    const generated = readFileSync(path.join(root, "dist", "core", "package-info.generated.js"), "utf8");
    if (!generated.includes(JSON.stringify(manifest.version))) throw new Error("Built package info does not match the root package version.");
  }
}

function verifyBins(directory, files) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  for (const [name, relativePath] of Object.entries(manifest.bin ?? {})) {
    const normalized = String(relativePath).replace(/^\.\//, "");
    const packed = files.find((file) => file.path === normalized);
    if (!packed) throw new Error(`Bin ${name} points to missing packed file: ${normalized}`);
    const filePath = path.join(directory, normalized);
    if (!readFileSync(filePath, "utf8").startsWith("#!/usr/bin/env node")) throw new Error(`Bin ${name} is missing a Node shebang.`);
    if (process.platform !== "win32" && (packed.mode & 0o111) === 0) throw new Error(`Bin ${name} is not executable in the packed manifest.`);
  }
}

function verifyDesktopMain(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  if (!manifest.main || !existsSync(path.join(directory, manifest.main))) throw new Error(`Desktop main file does not exist: ${String(manifest.main)}`);
}

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
