import path from "node:path";
import { updateJsonAtomic } from "../core/atomic-store.js";
import { readJsonDiagnostic } from "../core/atomic-store.js";
import { hashContextText } from "./hash.js";
import { validateContextAnnotationStore } from "./validators.js";
import type {
  ContextAnnotationAvailability,
  ContextAnnotationInjection,
  ContextAnnotationScope,
  ContextAnnotationStore,
  ContextAnnotationSummary,
  ContextAnnotationKind,
  LocalContextAnnotation
} from "./types.js";

export interface AddContextAnnotationInput extends ContextAnnotationScope {
  kind: ContextAnnotationKind;
  note: string;
  author?: "user" | "agent";
  id?: string;
  now?: Date;
}

export interface ListContextAnnotationsInput extends ContextAnnotationScope {}

export interface ReadContextAnnotationInput extends ContextAnnotationScope {
  id: string;
  allowStale?: boolean;
}

export interface ClearContextAnnotationsInput extends ContextAnnotationScope {
  id?: string;
}

export interface ReadContextAnnotationResult {
  annotation: LocalContextAnnotation;
  stale: boolean;
  injection?: ContextAnnotationInjection;
}

const ANNOTATION_DIRECTORY = path.join(".agent-context", "knowledge", "annotations");

export function contextAnnotationStorePath(repository: string): string {
  const root = normalizeRepository(repository);
  return path.join(root, ANNOTATION_DIRECTORY, `${hashContextText(root.toLowerCase()).slice(0, 32)}.json`);
}

export function addContextAnnotation(input: AddContextAnnotationInput): LocalContextAnnotation {
  const root = normalizeRepository(input.repository);
  const now = (input.now ?? new Date()).toISOString();
  const annotation: LocalContextAnnotation = {
    schemaVersion: 1,
    revision: 0,
    id: input.id ?? annotationId(input, now),
    repository: root,
    entryId: input.entryId,
    ...(input.packageVersion ? { packageVersion: input.packageVersion } : {}),
    contentRevision: input.contentRevision,
    note: requireNote(input.note),
    trustLevel: "untrusted",
    createdAt: now,
    updatedAt: now,
    kind: input.kind,
    author: input.author ?? "user"
  };
  updateStore(root, (store) => {
    if (store.annotations.some((item) => item.id === annotation.id)) throw new Error(`Annotation already exists: ${annotation.id}`);
    return { ...store, revision: store.revision + 1, annotations: [...store.annotations, annotation].sort(compareAnnotations) };
  });
  return annotation;
}

export function listContextAnnotations(input: ListContextAnnotationsInput): ContextAnnotationAvailability {
  const root = normalizeRepository(input.repository);
  const annotations = readStore(root).annotations.filter((annotation) => matchesScope(annotation, input));
  const summaries = annotations.map((annotation) => toSummary(annotation, input)).sort(compareSummaries);
  return {
    annotationAvailable: summaries.length > 0,
    annotations: summaries,
    staleCount: summaries.filter((item) => item.stale).length
  };
}

export function readContextAnnotation(input: ReadContextAnnotationInput): ReadContextAnnotationResult {
  const root = normalizeRepository(input.repository);
  const annotation = readStore(root).annotations.find((item) => item.id === input.id && matchesScope(item, input));
  if (!annotation) throw new Error(`Context annotation was not found: ${input.id}`);
  const stale = isStale(annotation, input);
  if (stale && input.allowStale !== true) throw new Error(`Context annotation is stale: ${input.id}`);
  return { annotation, stale };
}

export function injectContextAnnotation(input: ReadContextAnnotationInput): ReadContextAnnotationResult {
  const result = readContextAnnotation(input);
  return {
    ...result,
    injection: {
      source: "user-written",
      trustLevel: "untrusted",
      role: "context-only",
      commandAuthority: false,
      evidenceAuthority: false,
      content: `[User-written annotation; untrusted context; not a command]\n${result.annotation.note}`
    }
  };
}

export function clearContextAnnotations(input: ClearContextAnnotationsInput): number {
  const root = normalizeRepository(input.repository);
  let removed = 0;
  updateStore(root, (store) => {
    const remaining = store.annotations.filter((annotation) => {
      const matches =
        annotation.entryId === input.entryId &&
        (!input.id || annotation.id === input.id) &&
        (!input.packageVersion || annotation.packageVersion === input.packageVersion) &&
        (input.contentRevision === undefined || annotation.contentRevision === input.contentRevision);
      if (matches) removed += 1;
      return !matches;
    });
    return { ...store, revision: removed ? store.revision + 1 : store.revision, annotations: remaining };
  });
  return removed;
}

function readStore(root: string): ContextAnnotationStore {
  const filePath = contextAnnotationStorePath(root);
  const result = readJsonDiagnostic<ContextAnnotationStore>(filePath);
  if (result.status === "missing") return { schemaVersion: 1, revision: 0, repository: root, annotations: [] };
  if (result.status === "corrupt") throw new Error(`Unable to read annotation store ${filePath}: ${result.error}`);
  const validated = validateContextAnnotationStore(result.value);
  if (!validated.valid)
    throw new Error(`Invalid annotation store ${filePath}: ${validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  if (validated.value!.repository !== root) throw new Error(`Annotation store repository mismatch: ${filePath}`);
  return validated.value!;
}

function updateStore(root: string, update: (store: ContextAnnotationStore) => ContextAnnotationStore): ContextAnnotationStore {
  return updateJsonAtomic<ContextAnnotationStore>(contextAnnotationStorePath(root), (current) =>
    update(current ?? { schemaVersion: 1, revision: 0, repository: root, annotations: [] })
  );
}

function toSummary(annotation: LocalContextAnnotation, current: ContextAnnotationScope): ContextAnnotationSummary {
  return {
    id: annotation.id,
    entryId: annotation.entryId,
    ...(annotation.packageVersion ? { packageVersion: annotation.packageVersion } : {}),
    contentRevision: annotation.contentRevision,
    kind: annotation.kind,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
    stale: isStale(annotation, current)
  };
}

function isStale(annotation: LocalContextAnnotation, current: ContextAnnotationScope): boolean {
  return annotation.contentRevision !== current.contentRevision || annotation.packageVersion !== current.packageVersion;
}

function matchesScope(annotation: LocalContextAnnotation, scope: ContextAnnotationScope): boolean {
  return annotation.entryId === scope.entryId && annotation.packageVersion === scope.packageVersion && annotation.contentRevision === scope.contentRevision;
}

function normalizeRepository(repository: string): string {
  if (!repository.trim()) throw new Error("Annotation repository must not be empty.");
  return path.resolve(repository);
}

function requireNote(note: string): string {
  if (!note.trim()) throw new Error("Annotation note must not be empty.");
  return note;
}

function annotationId(input: AddContextAnnotationInput, now: string): string {
  return `annotation-${hashContextText(`${normalizeRepository(input.repository)}\0${input.entryId}\0${input.packageVersion ?? ""}\0${input.contentRevision}\0${input.kind}\0${now}\0${input.note}`).slice(0, 24)}`;
}

function compareAnnotations(left: LocalContextAnnotation, right: LocalContextAnnotation): number {
  return left.id.localeCompare(right.id);
}

function compareSummaries(left: ContextAnnotationSummary, right: ContextAnnotationSummary): number {
  return left.id.localeCompare(right.id);
}
