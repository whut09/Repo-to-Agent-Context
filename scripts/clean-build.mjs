import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const relativePath of ["dist"]) {
  const target = path.resolve(root, relativePath);
  if (target !== root && target.startsWith(`${root}${path.sep}`)) rmSync(target, { recursive: true, force: true });
}
