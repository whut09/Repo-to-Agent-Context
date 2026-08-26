import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { loadContextSourceRegistry } from "../context-registry/source-registry.js";
import { readContextUsage } from "../context-registry/usage-ledger.js";
import type { ContextUsageRecord } from "../context-registry/types.js";
import { currentWorkingTreeFingerprint } from "../core/working-tree.js";
import { contextToolError } from "./context-tool-errors.js";
import { contextToolFailure, contextToolSuccess, type ContextToolResult } from "./context-tools-protocol.js";
import { submitApplicationContextFeedback, type ApplicationContextFeedbackResult, type SubmitApplicationContextFeedbackInput } from "./context-feedback-service.js";
import {
  getContextFiles,
  searchContextEntries,
  type ContextEntrySearchResult,
  type GetContextFilesInput
} from "./context-service.js";
import { getApplicationInterventions, type ApplicationInterventionResult } from "./intervention-service.js";

export type ContextSearchToolInput = Parameters<typeof searchContextEntries>[0];
export type ContextGetToolInput = GetContextFilesInput;

export interface ContextStatusToolInput {
  repo: string;
  taskId?: string;
}

export interface InterventionsToolInput {
  repo: string;
  taskId: string;
}

export interface ApplicationContextStatus {
  repository: string;
  taskId: string | null;
  registry: {
    enabled: boolean;
    offline: boolean;
    valid: boolean;
    registryHash: string | null;
    sources: Array<{
      name: string;
      kind: string;
      trustLevel: string;
      cache: {
        status: "hit" | "miss";
        stale: boolean;
        fallback: boolean;
        fetchedAt?: string;
        contentHash?: string;
      };
      issues: Array<{ path: string; code: string; message: string }>;
    }>;
    issues: Array<{ path: string; code: string; message: string }>;
  };
  cache: {
    hits: number;
    misses: number;
    stale: number;
    fallback: number;
  };
  freshness: {
    status: "fresh" | "stale" | "unused";
    workingTreeHash: string;
    freshRecords: number;
    staleRecords: number;
  };
  selectedContext: ContextStatusSelection[];
  rejectedContext: ContextStatusRejection[];
  interventions: ApplicationInterventionResult["summary"] | null;
}

export interface ContextStatusSelection {
  usageId: string;
  entryId: string;
  source: string;
  selectedFiles: string[];
  cache: ContextUsageRecord["cache"];
}

export interface ContextStatusRejection {
  usageId: string;
  entryId: string;
  source: string;
  files: string[];
  reasons: string[];
}

export async function runContextSearchTool(input: ContextSearchToolInput): Promise<ContextToolResult<ContextEntrySearchResult>> {
  try {
    return contextToolSuccess("context-search", await searchContextEntries(input));
  } catch (error) {
    return contextToolFailure("context-search", contextToolError(error));
  }
}

export async function runContextGetTool(input: ContextGetToolInput): Promise<ContextToolResult<Awaited<ReturnType<typeof getContextFiles>>>> {
  try {
    return contextToolSuccess("context-get", await getContextFiles(input));
  } catch (error) {
    return contextToolFailure("context-get", contextToolError(error));
  }
}

export async function runContextStatusTool(input: ContextStatusToolInput): Promise<ContextToolResult<ApplicationContextStatus>> {
  try {
    const root = path.resolve(input.repo);
    const config = loadConfig(root);
    const registry = config.contextRegistry.enabled
      ? await loadContextSourceRegistry({
          root,
          sources: config.contextRegistry.sources,
          offline: config.contextRegistry.offline
        })
      : { valid: true, sources: [], issues: [], snapshot: undefined };
    const workingTreeHash = currentWorkingTreeFingerprint(root);
    const usages = input.taskId ? readContextUsage(root, input.taskId) : [];
    const current = usages.filter((record) => record.workingTreeHash === workingTreeHash && record.freshness.status === "fresh");
    const stale = usages.filter((record) => !current.includes(record));
    const sourceCaches = registry.sources.map((source) => source.cache);
    return contextToolSuccess("context-status", {
      repository: root,
      taskId: input.taskId ?? null,
      registry: {
        enabled: config.contextRegistry.enabled,
        offline: config.contextRegistry.offline,
        valid: registry.valid,
        registryHash: registry.snapshot?.registryHash ?? null,
        sources: registry.sources.map((source) => ({
          name: source.source.name,
          kind: source.source.kind,
          trustLevel: source.source.trustLevel,
          cache: source.cache,
          issues: source.issues
        })),
        issues: registry.issues
      },
      cache: {
        hits: sourceCaches.filter((cache) => cache.status === "hit").length,
        misses: sourceCaches.filter((cache) => cache.status === "miss").length,
        stale: sourceCaches.filter((cache) => cache.stale).length,
        fallback: sourceCaches.filter((cache) => cache.fallback).length
      },
      freshness: {
        status: usages.length === 0 ? "unused" : stale.length > 0 ? "stale" : "fresh",
        workingTreeHash,
        freshRecords: current.length,
        staleRecords: stale.length
      },
      selectedContext: current.map(contextSelection).sort((left, right) => left.usageId.localeCompare(right.usageId)),
      rejectedContext: stale.map((record) => contextRejection(record, workingTreeHash)).sort((left, right) => left.usageId.localeCompare(right.usageId)),
      interventions: input.taskId ? getApplicationInterventions(root, input.taskId).summary : null
    });
  } catch (error) {
    return contextToolFailure("context-status", contextToolError(error));
  }
}

export async function runInterventionsTool(input: InterventionsToolInput): Promise<ContextToolResult<ApplicationInterventionResult>> {
  try {
    return contextToolSuccess("interventions", getApplicationInterventions(input.repo, input.taskId));
  } catch (error) {
    return contextToolFailure("interventions", contextToolError(error));
  }
}

export async function runContextFeedbackTool(
  input: SubmitApplicationContextFeedbackInput
): Promise<ContextToolResult<ApplicationContextFeedbackResult & { annotationSeparate: true; evidenceAuthority: false }>> {
  try {
    const result = await submitApplicationContextFeedback(input);
    return contextToolSuccess("context-feedback", { ...result, annotationSeparate: true, evidenceAuthority: false });
  } catch (error) {
    return contextToolFailure("context-feedback", contextToolError(error));
  }
}

function contextSelection(record: ContextUsageRecord): ContextStatusSelection {
  return {
    usageId: record.usageId,
    entryId: record.entryId,
    source: record.provenance.sourceName,
    selectedFiles: [...record.selectedFiles].sort((left, right) => left.localeCompare(right)),
    cache: record.cache
  };
}

function contextRejection(record: ContextUsageRecord, workingTreeHash: string): ContextStatusRejection {
  const reasons: string[] = [];
  if (record.workingTreeHash !== workingTreeHash) reasons.push("working-tree-changed");
  if (record.freshness.status === "stale") reasons.push(record.freshness.reason ?? "context-stale");
  if (record.versionCompatibility.status === "mismatch") reasons.push(record.versionCompatibility.reason);
  return {
    usageId: record.usageId,
    entryId: record.entryId,
    source: record.provenance.sourceName,
    files: [...record.selectedFiles, ...record.omittedFiles].sort((left, right) => left.localeCompare(right)),
    reasons: [...new Set(reasons)].sort((left, right) => left.localeCompare(right))
  };
}
