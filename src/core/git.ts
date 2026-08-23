import { execFileSync } from "node:child_process";
import { isGeneratedCachePath, isGeneratedContextPath } from "./generated-paths.js";

const GIT_CANDIDATES = ["git", "D:\\Program Files\\Git\\cmd\\git.exe"];

export function runGit(cwd: string, args: string[]): string {
  const errors: string[] = [];
  for (const git of GIT_CANDIDATES) {
    try {
      return execFileSync(git, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Unable to run git. Tried: ${GIT_CANDIDATES.join(", ")}. ${errors[0] ?? ""}`);
}

export function resolveGitBase(cwd: string, preferred = "main"): string {
  const candidate = preferred.trim();
  if (candidate && gitRefExists(cwd, candidate)) return candidate;
  if (gitRefExists(cwd, "HEAD")) return "HEAD";
  return candidate || "HEAD";
}

function gitRefExists(cwd: string, ref: string): boolean {
  try {
    runGit(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export function changedFilesSince(cwd: string, base: string): string[] {
  const changed = parseGitPathList(runGit(cwd, ["diff", "--name-only", base]));
  const untracked = parseGitPathList(runGit(cwd, ["ls-files", "--others", "--exclude-standard"]));
  return [...new Set([...changed, ...untracked])].filter((file) => !isGeneratedCachePath(file)).sort();
}

export function collectWorkingTreeFiles(cwd: string, includeGenerated = false): string[] {
  const changed = parseGitPathList(runGit(cwd, ["diff", "--name-only"]));
  const staged = parseGitPathList(runGit(cwd, ["diff", "--cached", "--name-only"]));
  const untracked = parseGitPathList(runGit(cwd, ["ls-files", "--others", "--exclude-standard"]));
  return [...new Set([...changed, ...staged, ...untracked])].filter((file) => includeGenerated || !isGeneratedContextPath(file)).sort();
}

export function parseGitPathList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}
