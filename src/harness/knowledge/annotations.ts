import {
  addContextAnnotation,
  clearContextAnnotations,
  injectContextAnnotation,
  listContextAnnotations,
  readContextAnnotation,
  type AddContextAnnotationInput,
  type ClearContextAnnotationsInput,
  type ListContextAnnotationsInput,
  type ReadContextAnnotationInput,
  type ReadContextAnnotationResult
} from "../../context-registry/annotations.js";
import type {
  ContextAnnotationAvailability,
  ContextAnnotationInjection,
  ContextAnnotationScope,
  ContextAnnotationKind,
  LocalContextAnnotation
} from "../../context-registry/types.js";

export interface AddHarnessAnnotationInput extends Omit<AddContextAnnotationInput, "repository" | "author"> {
  repository: string;
  author?: "user" | "agent";
}

export type HarnessAnnotationQuery = ContextAnnotationScope;

export function addHarnessAnnotation(input: AddHarnessAnnotationInput): LocalContextAnnotation {
  return addContextAnnotation(input);
}

export function listHarnessAnnotations(input: ListContextAnnotationsInput): ContextAnnotationAvailability {
  return listContextAnnotations(input);
}

export function readHarnessAnnotation(input: ReadContextAnnotationInput): ReadContextAnnotationResult {
  return readContextAnnotation(input);
}

export function clearHarnessAnnotations(input: ClearContextAnnotationsInput): number {
  return clearContextAnnotations(input);
}

export function injectHarnessAnnotation(input: ReadContextAnnotationInput): ReadContextAnnotationResult & { injection: ContextAnnotationInjection } {
  return injectContextAnnotation(input) as ReadContextAnnotationResult & { injection: ContextAnnotationInjection };
}

export type { ContextAnnotationKind };
