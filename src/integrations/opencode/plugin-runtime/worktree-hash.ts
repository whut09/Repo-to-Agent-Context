import { spawnSync } from "node:child_process";
import { hashText } from "./evidence.js";

export function gitOutput(directory: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    shell: false
  });
  return [
    `$ git ${args.join(" ")}`,
    `status=${typeof result.status === "number" ? result.status : "unknown"}`,
    typeof result.stdout === "string" ? result.stdout : "",
    typeof result.stderr === "string" ? result.stderr : "",
    result.error?.message ?? ""
  ].join("\n");
}

export function currentSidecarWorkingTreeHash(directory: string): string {
  const pathspec = ["--", ".", ":(exclude).agent-context/**", ":(exclude)AGENTS.md"];
  return hashText(
    [gitOutput(directory, ["status", "--porcelain=v1", "--untracked-files=all", ...pathspec]), gitOutput(directory, ["diff", "--binary", ...pathspec])].join(
      "\n"
    )
  );
}
