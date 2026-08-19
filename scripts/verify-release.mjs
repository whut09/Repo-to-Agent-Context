import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = valueAfter("--package") ?? "core";
if (target !== "core") throw new Error(`Unknown release package: ${target}`);
verifyPackage(target);

function verifyPackage(name) {
  const config = {
    directory: root,
    maximumBytes: 500_000,
    maximumFiles: 200,
    // The Desktop plugin is the product entry. dist/cli and dist/mcp remain in the
    // developer package as internal dev/test surfaces, so they stay required too.
    required: ["package.json", "dist/integrations/opencode/global-plugin.js", "dist/core/package-info.generated.js", "dist/cli/index.js", "dist/mcp/server.js"],
    forbiddenPrefixes: ["assets/", "benchmarks/", "apps/desktop/", ".agent-context/", "release/", ".installer-build/"]
  };
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is required; run this check through npm run release:verify.");
  const result = spawnSync(process.execPath, [npmCli, "pack", config.directory, "--json", "--dry-run", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`npm pack failed for ${name}: ${result.stderr || result.stdout}`);
  const report = JSON.parse(result.stdout)[0];
  const paths = new Set(report.files.map((file) => file.path));
  for (const required of config.required) if (!paths.has(required)) throw new Error(`${name} package is missing required file: ${required}`);
  for (const file of paths) {
    if (config.forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) throw new Error(`${name} package contains forbidden file: ${file}`);
  }
  if (report.size > config.maximumBytes) throw new Error(`${name} package is ${report.size} bytes; maximum is ${config.maximumBytes}.`);
  if (report.entryCount > config.maximumFiles) throw new Error(`${name} package has ${report.entryCount} files; maximum is ${config.maximumFiles}.`);
  verifyBins(config.directory, report.files);
  verifyManifestVersion(config.directory, report.version);
  console.log(`${name}: ${report.entryCount} files, ${formatBytes(report.size)} packed, ${formatBytes(report.unpackedSize)} unpacked`);
}

function verifyManifestVersion(directory, packedVersion) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  if (manifest.version !== packedVersion) throw new Error(`Packed version ${packedVersion} does not match manifest ${String(manifest.version)}.`);
  const generated = readFileSync(path.join(root, "dist", "core", "package-info.generated.js"), "utf8");
  if (!generated.includes(JSON.stringify(manifest.version))) throw new Error("Built package info does not match the root package version.");
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

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
