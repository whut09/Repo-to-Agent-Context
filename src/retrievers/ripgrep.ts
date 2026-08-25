import { execFileSync } from "node:child_process";
import path from "node:path";
import type { ContextPackage, IndexedFile } from "../core/types.js";
import type { ContextHit, ContextRetriever, ContextRetrieverOptions } from "./types.js";
import { matchesFilters, snippetFor, sortHits, taskTerms } from "./static.js";

export class RipgrepContextRetriever implements ContextRetriever {
  readonly name = "ripgrep" as const;

  constructor(private readonly context: ContextPackage) {}

  async search(task: string, options: ContextRetrieverOptions): Promise<ContextHit[]> {
    const terms = taskTerms(task).slice(0, 8);
    if (!terms.length) return [];

    const fileMap = new Map(this.context.index.files.map((file) => [file.path, file]));
    const hitMap = new Map<string, ContextHit>();
    for (const term of terms) {
      for (const match of runRipgrep(this.context.scan.root, term)) {
        const file = fileMap.get(match.path);
        if (!file || !matchesFilters(file, file.moduleName, options)) continue;
        const current = hitMap.get(match.path) ?? hitFor(file, this.name);
        current.score += 20 + term.length;
        addLexicalBreakdown(current, 20 + term.length);
        current.snippet = current.snippet || snippetFor(match.text, [term]);
        const lines = current.metadata.lines as number[] | undefined;
        current.metadata.lines = [...new Set([...(lines ?? []), match.line])].slice(0, 12);
        hitMap.set(match.path, current);
      }
    }

    for (const changedFile of options.changedFiles ?? []) {
      const file = fileMap.get(changedFile);
      if (!file || !matchesFilters(file, file.moduleName, options)) continue;
      const current = hitMap.get(changedFile) ?? hitFor(file, this.name);
      current.score += 35;
      addChangedBreakdown(current, 35);
      hitMap.set(changedFile, current);
    }

    return sortHits([...hitMap.values()]).slice(0, Math.max(1, options.topK));
  }
}

function runRipgrep(root: string, term: string): Array<{ path: string; line: number; text: string }> {
  try {
    const output = execFileSync("rg", ["-n", "--no-heading", "--color", "never", "--fixed-strings", "--ignore-case", term, root], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseRgLine(root, line))
      .filter((item): item is { path: string; line: number; text: string } => Boolean(item));
  } catch {
    return [];
  }
}

function parseRgLine(root: string, line: string): { path: string; line: number; text: string } | null {
  const match = line.match(/^(.+?):(\d+):(.*)$/);
  if (!match) return null;
  return {
    path: path.relative(root, match[1]).replaceAll("\\", "/"),
    line: Number.parseInt(match[2], 10),
    text: match[3]
  };
}

function hitFor(file: IndexedFile, source: "ripgrep"): ContextHit {
  return {
    id: `ripgrep-${file.path}`,
    path: file.path,
    title: file.path,
    moduleName: file.moduleName,
    kind: file.kind,
    score: 0,
    source,
    snippet: file.summary,
    metadata: {
      analyzer: file.analyzer,
      confidence: file.confidence,
      scoreBreakdown: {
        lexical: 0,
        path: 0,
        changed: 0,
        importance: 0,
        taskType: 0,
        symbol: 0,
        dependencyChain: 0,
        regressionMemory: 0,
        negativeExample: 0,
        negativePenalty: 0,
        dependency: 0,
        source: 0,
        quality: 0,
        regression: 0,
        exactId: 0,
        total: 0
      }
    }
  };
}

function addLexicalBreakdown(hit: ContextHit, score: number): void {
  const breakdown = hit.metadata.scoreBreakdown;
  if (!breakdown) return;
  breakdown.lexical += score;
  breakdown.total += score;
}

function addChangedBreakdown(hit: ContextHit, score: number): void {
  const breakdown = hit.metadata.scoreBreakdown;
  if (!breakdown) return;
  breakdown.changed += score;
  breakdown.total += score;
}
