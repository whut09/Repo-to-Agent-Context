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
