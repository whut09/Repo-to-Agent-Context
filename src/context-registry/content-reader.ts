import { hashContextText } from "./hash.js";
import { normalizeRelativePath } from "./path-resolver.js";
import type { BuiltContextDocument } from "./registry-builder.js";
import type { ContextEntry, ContextFetchedFile, ContextFile } from "./types.js";

export interface ContextFileSelection {
  selectedFiles: string[];
  omittedFiles: string[];
  files: ContextFetchedFile[];
}

export function selectContextFiles(document: BuiltContextDocument, entry: ContextEntry, requestedFile?: string, full = false): ContextFileSelection {
  const available = [...entry.files].sort((left, right) => left.path.localeCompare(right.path));
  const selected = selectMetadataFiles(available, requestedFile, full);
  const contents = selected.map((file) => readVerifiedFile(document, file));
  const selectedPaths = selected.map((file) => file.path);
  return {
    selectedFiles: selectedPaths,
    omittedFiles: available.map((file) => file.path).filter((file) => !selectedPaths.includes(file)),
    files: contents
  };
}

function selectMetadataFiles(files: ContextFile[], requestedFile: string | undefined, full: boolean): ContextFile[] {
  if (requestedFile !== undefined) {
    const normalized = normalizeRelativePath(requestedFile);
    if (!normalized || normalized !== requestedFile.replaceAll("\\", "/")) throw new Error("Context file must be a normalized relative path.");
    const match = files.find((file) => file.path === normalized);
    if (!match) throw new Error(`Context file is not available in this entry: ${requestedFile}`);
    return [match];
  }
  if (full) return files;
  return files.filter((file) => file.role === "entry");
}

function readVerifiedFile(document: BuiltContextDocument, file: ContextFile): ContextFetchedFile {
  const content = document.contentByPath[file.path];
  if (typeof content !== "string") throw new Error(`Context file content is unavailable: ${file.path}`);
  const contentHash = hashContextText(content);
  if (contentHash !== file.contentHash) throw new Error(`Context file is stale: ${file.path}`);
  return { path: file.path, role: file.role, content, contentHash };
}
