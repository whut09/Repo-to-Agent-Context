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

export interface ContextEntry {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  id: string;
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

export interface ContextFetchCache {
  status: "hit" | "miss";
  sourceRegistryHash?: string;
  contentHash?: string;
}

export interface ContextFetchResult {
  schemaVersion: typeof CONTEXT_REGISTRY_SCHEMA_VERSION;
  revision: number;
  entry: ContextEntry;
  selectedFiles: string[];
  omittedFiles: string[];
  provenance: ContextProvenance;
  annotations?: ContextAnnotation[];
  cache: ContextFetchCache;
  contextMode: ContextFetchMode;
  durationMs: number;
}
