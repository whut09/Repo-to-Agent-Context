import type { ContextAdviceDecision, ContextProvenance, ContextUsageAuthority, ContextUsageRecord } from "../../context-registry/types.js";
import { readContextUsage } from "../../context-registry/usage-ledger.js";
import { currentWorkingTreeHash } from "../observability/execution-trace.js";

export const CONTEXT_POLICY_SCHEMA_VERSION = "opencode-plusplus.context-policy.v1" as const;

export interface ContextPolicyFinding {
  id: string;
  entryId?: string;
  status: "blocked" | "warning" | "passed";
  message: string;
  evidence: string[];
  requiredAction?: string;
}

export interface ContextInterventionExplanation {
  providedHelp: string[];
  adoptedSuggestions: ContextAdviceDecision[];
  availableSuggestions: ContextAdviceDecision[];
  rejectedSuggestions: ContextAdviceDecision[];
}

export interface ContextPolicyAssessment {
  schemaVersion: typeof CONTEXT_POLICY_SCHEMA_VERSION;
  taskId?: string;
  currentWorkingTreeHash: string;
  records: ContextUsageRecord[];
  provenance: ContextProvenance[];
  authority: ContextUsageAuthority;
  findings: ContextPolicyFinding[];
  intervention: ContextInterventionExplanation;
}

export interface AssessContextPolicyOptions {
  taskId?: string;
  records?: ContextUsageRecord[];
  currentWorkingTreeHash?: string;
}

const NO_CONTEXT_AUTHORITY: ContextUsageAuthority = {
  commandAuthority: false,
  evidenceAuthority: false,
  contractAuthority: false,
  freshnessAuthority: false,
  forbiddenPathAuthority: false,
  finalizeAuthority: false
};

export function assessExternalContextPolicy(root: string, options: AssessContextPolicyOptions = {}): ContextPolicyAssessment {
  const workingTreeHash = options.currentWorkingTreeHash ?? currentWorkingTreeHash(root);
  let records: ContextUsageRecord[] = [];
  let diagnostic: string | undefined;
  try {
    records = latestUsage(options.records ?? (options.taskId ? readContextUsage(root, options.taskId) : []));
  } catch (error) {
    diagnostic = error instanceof Error ? error.message : String(error);
  }
  const findings: ContextPolicyFinding[] = [];
  if (diagnostic) {
    findings.push({
      id: "context.registry-usage-corrupt",
      status: "blocked",
      message: "External Context usage provenance is unreadable.",
      evidence: [diagnostic],
      requiredAction: "Fetch the Context entry again before relying on it."
    });
  }
  for (const record of records) {
    const staleReasons = contextStaleReasons(record, workingTreeHash);
    findings.push(
      staleReasons.length
        ? {
            id: `context.external-stale:${record.entryId}`,
            entryId: record.entryId,
            status: "blocked",
            message: "External Context is stale for the current working tree.",
            evidence: staleReasons,
            requiredAction: `Fetch ${record.entryId} again before using it for Harness decisions.`
          }
        : {
            id: `context.external-fresh:${record.entryId}`,
            entryId: record.entryId,
            status: "passed",
            message: "External Context provenance is fresh for the current working tree.",
            evidence: [`${record.entryId} was checked at ${record.freshness.checkedAt}.`]
          }
    );
    if (record.versionCompatibility.status === "mismatch") {
      findings.push({
        id: `context.version-mismatch:${record.entryId}`,
        entryId: record.entryId,
        status: "warning",
        message: "External Context package version does not match the repository.",
        evidence: [
          `Context version: ${record.versionCompatibility.contextVersion ?? "unknown"}.`,
          `Repository version: ${record.versionCompatibility.repositoryVersion ?? "unknown"}.`,
          record.versionCompatibility.reason
        ],
        requiredAction: `Select Context for the repository version before adopting version-specific guidance.`
      });
    }
  }
  const advice = records.flatMap((record) => record.advice);
  return {
    schemaVersion: CONTEXT_POLICY_SCHEMA_VERSION,
    ...(options.taskId ? { taskId: options.taskId } : {}),
    currentWorkingTreeHash: workingTreeHash,
    records,
    provenance: uniqueProvenance(records.map((record) => record.provenance)),
    authority: NO_CONTEXT_AUTHORITY,
    findings: findings.sort((left, right) => left.id.localeCompare(right.id)),
    intervention: {
      providedHelp: providedHelp(records),
      adoptedSuggestions: advice.filter((item) => item.disposition === "adopted").sort(compareAdvice),
      availableSuggestions: advice.filter((item) => item.disposition === "available").sort(compareAdvice),
      rejectedSuggestions: advice.filter((item) => item.disposition === "rejected").sort(compareAdvice)
    }
  };
}

function contextStaleReasons(record: ContextUsageRecord, workingTreeHash: string): string[] {
  const reasons: string[] = [];
  if (record.freshness.status !== "fresh") reasons.push(record.freshness.reason ?? "Context fetch reported stale freshness.");
  if (record.cache.stale) reasons.push("Context source cache is stale.");
  if (!record.provenance.verified) reasons.push("Context provenance was not verified against its source content hash.");
  if (record.workingTreeHash !== workingTreeHash) {
    reasons.push(`Context working tree hash ${record.workingTreeHash} does not match current ${workingTreeHash}.`);
  }
  return [...new Set(reasons)].sort((left, right) => left.localeCompare(right));
}

function latestUsage(records: ContextUsageRecord[]): ContextUsageRecord[] {
  const latest = new Map<string, ContextUsageRecord>();
  for (const record of records) {
    const key = `${record.provenance.sourceName}:${record.entryId}`;
    const previous = latest.get(key);
    if (!previous || compareUsage(previous, record) < 0) latest.set(key, record);
  }
  return [...latest.values()].sort((left, right) => left.entryId.localeCompare(right.entryId) || left.usageId.localeCompare(right.usageId));
}

function compareUsage(left: ContextUsageRecord, right: ContextUsageRecord): number {
  return left.fetchedAt.localeCompare(right.fetchedAt) || left.usageId.localeCompare(right.usageId);
}

function providedHelp(records: ContextUsageRecord[]): string[] {
  return [
    ...records.flatMap((record) => record.selectedFiles.map((file) => `${record.entryId} located ${file}.`)),
    ...records.filter((record) => record.apiVersion || record.packageVersion).map((record) => `${record.entryId} supplied API/package version metadata.`),
    ...records.flatMap((record) => record.advice.filter((item) => item.kind === "error-handling").map((item) => item.summary)),
    ...records.flatMap((record) => record.advice.filter((item) => item.kind === "workaround").map((item) => item.summary))
  ]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));
}

function uniqueProvenance(values: ContextProvenance[]): ContextProvenance[] {
  return [...new Map(values.map((item) => [`${item.sourceName}:${item.entryId}:${item.contentRevision}:${item.contentHash}`, item])).values()].sort(
    (left, right) => left.entryId.localeCompare(right.entryId) || left.sourceName.localeCompare(right.sourceName)
  );
}

function compareAdvice(left: ContextAdviceDecision, right: ContextAdviceDecision): number {
  return left.id.localeCompare(right.id);
}
