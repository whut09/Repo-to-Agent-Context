import { chmodSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const relativePath of ["dist/cli/index.js", "dist/mcp/server.js"]) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing built bin file: ${relativePath}`);
  if (!readFileSync(filePath, "utf8").startsWith("#!/usr/bin/env node")) throw new Error(`Bin file is missing a Node shebang: ${relativePath}`);
  if (process.platform !== "win32") chmodSync(filePath, 0o755);
}
