import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const outputPath = path.join(root, "src", "core", "package-info.generated.ts");
const output = [
  `export const GENERATED_PACKAGE_NAME = ${JSON.stringify(packageJson.name)};`,
  `export const GENERATED_PACKAGE_VERSION = ${JSON.stringify(packageJson.version)};`,
  ""
].join("\n");

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== output) throw new Error("Generated package info is stale. Run npm run package-info:generate.");
  checkLockVersions(path.join(root, "package-lock.json"), packageJson.version);
} else {
  writeFileSync(outputPath, output, "utf8");
  syncLockVersions(path.join(root, "package-lock.json"), packageJson.version);
}

function checkLockVersions(filePath, expectedVersion) {
  const lock = JSON.parse(readFileSync(filePath, "utf8"));
  for (const key of ["version", "packages..version"]) {
    const actual = key === "version" ? lock.version : lock.packages?.[""]?.version;
    if (actual !== expectedVersion) throw new Error(`package-lock ${key} ${String(actual)} does not match root ${expectedVersion}.`);
  }
}

function syncLockVersions(filePath, version) {
  const lock = JSON.parse(readFileSync(filePath, "utf8"));
  if (lock.version === version && lock.packages?.[""]?.version === version) return;
  lock.version = version;
  lock.packages[""].version = version;
  writeFileSync(filePath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}
