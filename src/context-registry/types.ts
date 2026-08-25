export const CONTEXT_REGISTRY_SCHEMA_VERSION = 1 as const;

export type ContextSourceKind = "local" | "remote" | "bundled";
export type ContextTrustLevel = "official" | "maintainer" | "community" | "private" | "untrusted";
export type ContextEntryKind = "doc" | "skill" | "reference" | "task-pack" | "repository";
export type ContextFileRole = "entry" | "reference" | "example" | "error" | "other";

export interface ContextSourceConfig {
  name: string;
  kind: ContextSourceKind;
  location: string;
  trustLevel: ContextTrustLevel;
  enabled?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  sha256?: string;
  cacheTtlMs?: number;
}

export interface ContextFile {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  path: string;
  role: ContextFileRole;
  contentHash: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface ContextSource {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  name: string;
  kind: ContextSourceKind;
  location: string;
  trustLevel: ContextTrustLevel;
  enabled: boolean;
  registryHash?: string;
  fetchedAt?: string;
  updatedAt: string;
}

export interface ContextProvenance {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  sourceName: string;
  sourceTrustLevel: ContextTrustLevel;
  entryId: string;
  packageVersion?: string;
  contentRevision: number;
  contentHash: string;
  fetchedAt?: string;
  verified: boolean;
}

export interface ContextAnnotation {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  id: string;
  repository: string;
  entryId: string;
  packageVersion?: string;
  contentRevision: number;
  note: string;
  trustLevel: "untrusted";
  createdAt: string;
  updatedAt: string;
}

export type ContextAnnotationKind = "environment" | "version-difference" | "failure-cause" | "convention" | "workaround";

export interface LocalContextAnnotation extends ContextAnnotation {
  kind: ContextAnnotationKind;
  author: "user" | "agent";
}

export interface ContextAnnotationStore {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  repository: string;
  annotations: LocalContextAnnotation[];
}

export interface ContextAnnotationScope {
  repository: string;
  entryId: string;
  packageVersion?: string;
  contentRevision: number;
}

export interface ContextAnnotationSummary {
  id: string;
  entryId: string;
  packageVersion?: string;
  contentRevision: number;
  kind: ContextAnnotationKind;
  createdAt: string;
  updatedAt: string;
  stale: boolean;
}

export interface ContextAnnotationAvailability {
  annotationAvailable: boolean;
  annotations: ContextAnnotationSummary[];
  staleCount: number;
}

export interface ContextAnnotationInjection {
  source: "user-written";
  trustLevel: "untrusted";
  role: "context-only";
  commandAuthority: false;
  evidenceAuthority: false;
  content: string;
}

export interface ContextEntry {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  id: string;
  canonicalId?: string;
  variantKey?: string;
  apiVersion?: string;
  name: string;
  description: string;
  kind: ContextEntryKind;
  tags: string[];
  language?: string;
  packageVersion?: string;
  contentRevision: number;
  updatedAt: string;
  sourceName: string;
  trustLevel: ContextTrustLevel;
  files: ContextFile[];
  contentHash: string;
  provenance: ContextProvenance;
  symbols?: string[];
  dependencyChain?: string[];
  qualityScore?: number;
}

export interface ContextPack {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  id: string;
  sourceName: string;
  generatedAt: string;
  entries: ContextEntry[];
  contentHash: string;
}

export type ContextFetchMode = "reused" | "incremental" | "rebuilt";
export type ContextFetchSelectionMode = "entry" | "file" | "full";

export interface ContextFetchedFile {
  path: string;
  role: ContextFileRole;
  content: string;
  contentHash: string;
}

export interface ContextFetchFreshness {
  status: "fresh" | "stale";
  workingTreeHash: string;
  checkedAt: string;
  reason?: string;
}

export interface ContextFetchCache {
  status: "hit" | "miss";
  sourceName?: string;
  sourceRegistryHash?: string;
  fetchedAt?: string;
  contentHash?: string;
  stale?: boolean;
  fallback?: boolean;
}

export interface ContextSourceCacheMetadata {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  sourceName: string;
  sourceLocation: string;
  registryHash: string;
  fetchedAt: string;
  contentHash: string;
  expiresAt?: string;
}

export interface ContextRegistryConflict {
  canonicalId: string;
  sourceNames: string[];
  entryIds: string[];
}

export interface ContextRegistrySnapshot {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  generatedAt: string;
  entries: ContextEntry[];
  sources: ContextSource[];
  conflicts: ContextRegistryConflict[];
  cache: ContextFetchCache[];
  registryHash: string;
}

export interface ContextFetchResult {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  entry: ContextEntry;
  selectedFiles: string[];
  omittedFiles: string[];
  files?: ContextFetchedFile[];
  fetchMode?: ContextFetchSelectionMode;
  provenance: ContextProvenance;
  annotations?: ContextAnnotation[];
  cache: ContextFetchCache;
  contextMode: ContextFetchMode;
  freshness?: ContextFetchFreshness;
  durationMs: number;
}
