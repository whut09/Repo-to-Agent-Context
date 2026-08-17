import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve("docs");
const missing = [];

for (const file of walk(root)) {
  if (!file.endsWith(".md") || file.endsWith(".zh-CN.md")) continue;
  const relative = path.relative(root, file);
  const chinese = path.join(path.dirname(file), path.basename(file, ".md") + ".zh-CN.md");
  if (!existsSync(chinese)) missing.push(relative);
}

if (missing.length > 0) {
  throw new Error("Missing Chinese documentation counterparts:\n" + missing.map((file) => "- " + file).join("\n"));
}

console.log("Bilingual documentation check passed: " + countMarkdown(root) + " English pages have Chinese counterparts.");

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else yield file;
  }
}

function countMarkdown(directory) {
  return [...walk(directory)].filter((file) => file.endsWith(".md") && !file.endsWith(".zh-CN.md")).length;
}
