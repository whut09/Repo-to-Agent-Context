import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export function currentWorkingTreeFingerprint(root: string): string {
  const pathspec = ["--", ".", ":(exclude).agent-context/**", ":(exclude)AGENTS.md"];
  return hashText([gitOutput(root, ["status", "--porcelain=v1", "--untracked-files=all", ...pathspec]), gitOutput(root, ["diff", "--binary", ...pathspec])].join("\n"));
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
