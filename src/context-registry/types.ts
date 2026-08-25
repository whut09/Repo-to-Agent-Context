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
