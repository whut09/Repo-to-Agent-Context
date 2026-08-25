import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function currentWorkingTreeFingerprint(root: string): string {
  const gitCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8", shell: false });
  if (gitCheck.status !== 0 || gitCheck.stdout?.trim() !== "true") return hashFileTree(root);
  const pathspec = ["--", ".", ":(exclude).agent-context/**", ":(exclude)AGENTS.md"];
  return hashText(
    [gitOutput(root, ["status", "--porcelain=v1", "--untracked-files=all", ...pathspec]), gitOutput(root, ["diff", "--binary", ...pathspec])].join("\n")
  );
}

function hashFileTree(root: string): string {
  const files: string[] = [];
  walk(root, root, files);
  return hashText(
    files
      .sort()
      .map((file) => `${file}\0${hashText(readFileSync(path.join(root, file), "utf8"))}`)
      .join("\n")
  );
}

function walk(root: string, directory: string, files: string[]): void {
  for (const item of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (item.name === ".git" || item.name === ".agent-context" || item.name === "node_modules") continue;
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) walk(root, absolute, files);
    else if (item.isFile() && existsSync(absolute) && statSync(absolute).size <= 16 * 1024 * 1024)
      files.push(path.relative(root, absolute).replaceAll("\\", "/"));
  }
}

function gitOutput(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, shell: false });
  return [
    `$ git ${args.join(" ")}`,
    `status=${typeof result.status === "number" ? result.status : "unknown"}`,
    typeof result.stdout === "string" ? result.stdout : "",
    typeof result.stderr === "string" ? result.stderr : "",
    result.error?.message ?? ""
  ].join("\n");
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
