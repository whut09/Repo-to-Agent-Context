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
  checkVersion(path.join(root, "apps", "desktop", "package.json"), packageJson.version, "Desktop package");
  checkLockVersions(path.join(root, "package-lock.json"), packageJson.version);
} else {
  writeFileSync(outputPath, output, "utf8");
  syncVersion(path.join(root, "apps", "desktop", "package.json"), packageJson.version);
  syncLockVersions(path.join(root, "package-lock.json"), packageJson.version);
}

function checkVersion(filePath, expectedVersion, label) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (parsed.version !== expectedVersion) throw new Error(`${label} version ${String(parsed.version)} does not match root ${expectedVersion}.`);
}

function syncVersion(filePath, version) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (parsed.version === version) return;
  parsed.version = version;
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function checkLockVersions(filePath, expectedVersion) {
  const lock = JSON.parse(readFileSync(filePath, "utf8"));
  for (const key of ["version", "packages..version", "packages.apps/desktop.version"]) {
    const actual = valueAt(lock, key);
    if (actual !== expectedVersion) throw new Error(`package-lock ${key} ${String(actual)} does not match root ${expectedVersion}.`);
  }
}

function syncLockVersions(filePath, version) {
  const lock = JSON.parse(readFileSync(filePath, "utf8"));
  if (lock.version === version && lock.packages?.[""]?.version === version && lock.packages?.["apps/desktop"]?.version === version) return;
  lock.version = version;
  lock.packages[""].version = version;
  lock.packages["apps/desktop"].version = version;
  writeFileSync(filePath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

function valueAt(value, key) {
  if (key === "version") return value.version;
  if (key === "packages..version") return value.packages?.[""]?.version;
  return value.packages?.["apps/desktop"]?.version;
}
