import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testFiles = readdirSync(path.join(root, "test"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map((entry) => path.join(root, "test", entry.name))
  .sort();

if (!testFiles.length) throw new Error("No test files found.");

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testFiles], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
