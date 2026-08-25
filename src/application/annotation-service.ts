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
} from "../context-registry/annotations.js";
import type { ContextAnnotationAvailability, ContextAnnotationInjection, LocalContextAnnotation } from "../context-registry/types.js";

export function addApplicationAnnotation(input: AddContextAnnotationInput): LocalContextAnnotation {
  return addContextAnnotation(input);
}

export function listApplicationAnnotations(input: ListContextAnnotationsInput): ContextAnnotationAvailability {
  return listContextAnnotations(input);
}

export function readApplicationAnnotation(input: ReadContextAnnotationInput): ReadContextAnnotationResult {
  return readContextAnnotation(input);
}

export function injectApplicationAnnotation(input: ReadContextAnnotationInput): ReadContextAnnotationResult & { injection: ContextAnnotationInjection } {
  return injectContextAnnotation(input) as ReadContextAnnotationResult & { injection: ContextAnnotationInjection };
}

export function clearApplicationAnnotations(input: ClearContextAnnotationsInput): number {
  return clearContextAnnotations(input);
}
