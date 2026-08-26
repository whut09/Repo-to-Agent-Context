import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readJsonDiagnostic, updateJsonAtomic } from "../core/atomic-store.js";
import { taskSlug } from "../core/task-id.js";
import { hashContextText } from "./hash.js";
import type {
  ContextAdviceDecision,
  ContextEntry,
  ContextFetchResult,
  ContextUsageAuthority,
  ContextUsageRecord,
  ContextUsageStore,
  ContextVersionCompatibility
} from "./types.js";

const CONTEXT_USAGE_AUTHORITY: ContextUsageAuthority = {
  commandAuthority: false,
  evidenceAuthority: false,
  contractAuthority: false,
  freshnessAuthority: false,
  forbiddenPathAuthority: false,
  finalizeAuthority: false
};

export function contextUsageStorePath(root: string, taskId: string): string {
  return path.join(path.resolve(root), ".agent-context", "context-registry", "usage", `${taskSlug(taskId)}.json`);
}

export function recordContextUsage(root: string, taskId: string, result: ContextFetchResult): ContextUsageRecord {
  const repository = path.resolve(root);
  const record = createContextUsageRecord(repository, taskId, result);
  updateJsonAtomic<ContextUsageStore>(contextUsageStorePath(repository, taskId), (current) => {
    const store = current ?? { schemaVersion: 1, revision: 0, repository, taskId, records: [] };
    validateStore(store, repository, taskId);
    const records = [...store.records.filter((item) => item.usageId !== record.usageId), record].sort(compareUsage);
    return { ...store, revision: store.revision + 1, records };
  });
  return record;
}

export function readContextUsage(root: string, taskId: string): ContextUsageRecord[] {
  const filePath = contextUsageStorePath(root, taskId);
  const result = readJsonDiagnostic<ContextUsageStore>(filePath);
  if (result.status === "missing") return [];
  if (result.status === "corrupt") throw new Error(`Unable to read Context usage ledger ${filePath}: ${result.error}`);
  validateStore(result.value, path.resolve(root), taskId);
  return [...result.value.records].sort(compareUsage);
}

export function createContextUsageRecord(root: string, taskId: string, result: ContextFetchResult): ContextUsageRecord {
  const fetchedAt = result.freshness?.checkedAt ?? new Date().toISOString();
  const workingTreeHash = result.freshness?.workingTreeHash ?? "unknown";
  const versionCompatibility = contextVersionCompatibility(root, result.entry);
  const advice = contextAdvice(result);
  const usageId = `context-usage-${hashContextText(
    [taskId, result.provenance.sourceName, result.entry.id, result.entry.contentHash, workingTreeHash, result.selectedFiles.join("\0")].join("\n")
  ).slice(0, 24)}`;
  return {
    schemaVersion: 1,
    usageId,
    taskId,
    fetchedAt,
    workingTreeHash,
    entryId: result.entry.id,
    entryName: result.entry.name,
    ...(result.entry.packageVersion ? { packageVersion: result.entry.packageVersion } : {}),
    ...(result.entry.apiVersion ? { apiVersion: result.entry.apiVersion } : {}),
    contentRevision: result.entry.contentRevision,
    selectedFiles: unique(result.selectedFiles),
    omittedFiles: unique(result.omittedFiles),
    provenance: result.provenance,
    freshness: result.freshness ?? { status: "stale", workingTreeHash, checkedAt: fetchedAt, reason: "Context freshness was not recorded." },
    cache: result.cache,
    versionCompatibility,
    advice,
    authority: CONTEXT_USAGE_AUTHORITY
  };
}

function contextAdvice(result: ContextFetchResult): ContextAdviceDecision[] {
  const decisions: ContextAdviceDecision[] = [];
  if (result.selectedFiles.length) {
    decisions.push(
      decision(result, "file-location", "adopted", `Use ${result.selectedFiles.length} Context file(s) to locate relevant implementation details.`, "Files were explicitly selected for inspection.")
    );
  }
  if (result.entry.apiVersion || result.entry.packageVersion) {
    decisions.push(
      decision(
        result,
        "api-version",
        "adopted",
        `Use Context version metadata: API ${result.entry.apiVersion ?? "unspecified"}, package ${result.entry.packageVersion ?? "unspecified"}.`,
        "Version metadata is informational and is checked against repository configuration."
      )
    );
  }
  for (const file of result.files ?? []) {
    if (file.role === "error" || /(^|\/)(errors?|troubleshooting)(\.|\/)/i.test(file.path)) {
      decisions.push(decision(result, "error-handling", "available", `Error-handling guidance is available from ${file.path}.`, "Guidance may inform a repair but cannot prove it worked.", file.path));
    }
    for (const line of file.content.split(/\r?\n/)) {
      const command = suggestedCommand(line);
      if (command) {
        decisions.push(
          decision(
            result,
            "command",
            "rejected",
            `External Context suggested command: ${command}`,
            "Context commands are suggestions only; command guards and explicit execution must evaluate them.",
            file.path,
            command
          )
        );
      } else if (/\b(tests? (?:pass|passed)|contract (?:is )?valid|validation passed|finalize|ready to (?:ship|merge))\b/i.test(line)) {
        decisions.push(
          decision(
            result,
            "evidence-claim",
            "rejected",
            `External Context contains an unverified completion claim in ${file.path}.`,
            "Only fresh command or CI evidence from the current working tree can satisfy verification requirements.",
            file.path
          )
        );
      }
    }
  }
  if (result.annotationInjection) {
    decisions.push(
      decision(
        result,
        "workaround",
        "available",
        "A repository annotation supplied a historical workaround.",
        "The workaround is user-written, untrusted, and available only as contextual guidance."
      )
    );
  }
  return dedupeAdvice(decisions);
}

function decision(
  result: ContextFetchResult,
  kind: ContextAdviceDecision["kind"],
  disposition: ContextAdviceDecision["disposition"],
  summary: string,
  reason: string,
  sourceFile?: string,
  suggestedCommandValue?: string
): ContextAdviceDecision {
  const id = `context-advice-${hashContextText([result.entry.id, kind, summary, sourceFile ?? ""].join("\n")).slice(0, 24)}`;
  return {
    id,
    kind,
    disposition,
    summary,
    reason,
    ...(sourceFile ? { sourceFile } : {}),
    ...(suggestedCommandValue ? { suggestedCommand: suggestedCommandValue } : {})
  };
}

function suggestedCommand(line: string): string | undefined {
  const trimmed = line.trim().replace(/^[-*]\s+/, "").replace(/^\$\s*/, "");
  if (!/^(npm|pnpm|yarn|bun|npx|node|deno|python|python3|pytest|cargo|go|git|opencode-plusplus)\b/i.test(trimmed)) return undefined;
  return trimmed.slice(0, 500);
}

function contextVersionCompatibility(root: string, entry: ContextEntry): ContextVersionCompatibility {
  if (!entry.packageVersion) return { status: "unknown", reason: "Context entry does not declare a package version." };
  const manifestPath = path.join(root, "package.json");
  if (!existsSync(manifestPath)) {
    return { status: "unknown", contextVersion: entry.packageVersion, reason: "Repository package.json was not found." };
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const repositoryVersion = dependencyVersion(manifest, entry.name);
    if (!repositoryVersion) {
      return { status: "unknown", contextVersion: entry.packageVersion, reason: `Repository does not declare ${entry.name} as a package dependency.` };
    }
    const matches = normalizedVersion(repositoryVersion) === normalizedVersion(entry.packageVersion);
    return {
      status: matches ? "match" : "mismatch",
      contextVersion: entry.packageVersion,
      repositoryVersion,
      reason: matches ? "Context and repository package versions match." : "Context package version does not match the repository dependency version."
    };
  } catch (error) {
    return { status: "unknown", contextVersion: entry.packageVersion, reason: `Unable to inspect repository package version: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function dependencyVersion(manifest: Record<string, unknown>, name: string): string | undefined {
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = manifest[field];
    if (dependencies && typeof dependencies === "object" && typeof (dependencies as Record<string, unknown>)[name] === "string") {
      return (dependencies as Record<string, string>)[name];
    }
  }
  return undefined;
}

function normalizedVersion(value: string): string {
  return value.trim().replace(/^[~^=v\s]+/, "").split(/[\s|]/)[0] ?? value;
}

function validateStore(store: ContextUsageStore, repository: string, taskId: string): void {
  if (store.schemaVersion !== 1) throw new Error(`Unsupported Context usage schemaVersion ${String(store.schemaVersion)}.`);
  if (path.resolve(store.repository) !== repository) throw new Error("Context usage ledger repository does not match the current repository.");
  if (store.taskId !== taskId) throw new Error("Context usage ledger taskId does not match the requested task.");
  if (!Array.isArray(store.records)) throw new Error("Context usage ledger records are invalid.");
}

function compareUsage(left: ContextUsageRecord, right: ContextUsageRecord): number {
  return left.fetchedAt.localeCompare(right.fetchedAt) || left.usageId.localeCompare(right.usageId);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function dedupeAdvice(values: ContextAdviceDecision[]): ContextAdviceDecision[] {
  return [...new Map(values.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id));
}
