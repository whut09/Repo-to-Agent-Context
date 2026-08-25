import { readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { hashContextText, hashContextValue } from "./hash.js";
import { parseContextFrontmatter, type ParsedContextDocument } from "./frontmatter.js";
import { validateCompanionContent, validateContextDocument, companionUpdatedAt, contextFileRole, type ContextContentPolicy } from "./content-validator.js";
import { invalidResult, type ContextSchemaIssue } from "./schema.js";
import { relativeContextPath, resolveContextFile, resolveContextSource, type ContextPathOptions } from "./path-resolver.js";
import { validateContextPack } from "./validators.js";
import type { ContextEntry, ContextFile, ContextPack, ContextSourceConfig } from "./types.js";

export interface ContextPackBuildOptions extends ContextPathOptions {
  source: ContextSourceConfig;
  generatedAt?: string;
  validateOnly?: boolean;
  contentPolicy?: ContextContentPolicy;
}

export interface BuiltContextDocument {
  entry: ContextEntry;
  sourceRoot: string;
  mainPath: string;
  contentByPath: Readonly<Record<string, string>>;
}

export interface ContextPackBuildResult {
  valid: boolean;
  validateOnly: boolean;
  sourceRoot?: string;
  pack?: ContextPack;
  documents: BuiltContextDocument[];
  issues: ContextSchemaIssue[];
  discoveredEntries: number;
}

interface DiscoveredDocument {
  parsed: ParsedContextDocument;
  sourceRoot: string;
  mainPath: string;
  files: ContextFile[];
  contentByPath: Record<string, string>;
}

export function buildContextPack(options: ContextPackBuildOptions): ContextPackBuildResult {
  const resolvedSource = resolveContextSource(options.source, options);
  if (!resolvedSource.valid) {
    return { valid: false, validateOnly: options.validateOnly ?? false, documents: [], issues: resolvedSource.issues, discoveredEntries: 0 };
  }
  const sourceRoot = resolvedSource.value!.root;
  const documents: DiscoveredDocument[] = [];
  const issues: ContextSchemaIssue[] = [];
  for (const mainPath of discoverContextDocuments(sourceRoot)) {
    const parsedResult = parseContextFrontmatter(readFileSync(mainPath, "utf8"), mainPath);
    if (!parsedResult.valid) {
      issues.push(...parsedResult.issues);
      continue;
    }
    const parsed = parsedResult.value!;
    const contentResult = validateContextDocument(parsed, options.contentPolicy);
    if (!contentResult.valid) {
      issues.push(...contentResult.issues);
      continue;
    }
    const companion = collectCompanionFiles(sourceRoot, mainPath, options.contentPolicy);
    issues.push(...companion.issues);
    documents.push({
      parsed,
      sourceRoot,
      mainPath,
      files: [createContextFile(sourceRoot, mainPath, "entry", parsed.frontmatter.revision), ...companion.files],
      contentByPath: { ...companion.contentByPath, [relativeContextPath(sourceRoot, mainPath)!]: parsed.body }
    });
  }
  if (issues.length) {
    return {
      valid: false,
      validateOnly: options.validateOnly ?? false,
      sourceRoot,
      documents: [],
      issues,
      discoveredEntries: documents.length
    };
  }

  const entries = createEntries(documents, options.source);
  const pack: ContextPack = {
    schemaVersion: 1,
    revision: 0,
    id: `${options.source.name}/context-pack`,
    sourceName: options.source.name,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    entries: entries.map((document) => document.entry),
    contentHash: hashContextValue(entries.map((document) => document.entry))
  };
  const packResult = validateContextPack(pack);
  if (!packResult.valid) {
    return {
      valid: false,
      validateOnly: options.validateOnly ?? false,
      sourceRoot,
      documents: [],
      issues: packResult.issues,
      discoveredEntries: documents.length
    };
  }
  return {
    valid: true,
    validateOnly: options.validateOnly ?? false,
    sourceRoot,
    pack: packResult.value!,
    documents: entries,
    issues: [],
    discoveredEntries: documents.length
  };
}

export const buildLocalContextPack = buildContextPack;

export function discoverContextDocuments(root: string): string[] {
  const result: string[] = [];
  walkDocuments(realpathSync(root), result);
  return result.sort((left, right) => left.localeCompare(right));
}

function walkDocuments(directory: string, result: string[]): void {
  for (const item of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const itemPath = path.join(directory, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      walkDocuments(itemPath, result);
      continue;
    }
    if (item.isFile() && ["doc.md", "skill.md"].includes(item.name.toLowerCase())) result.push(itemPath);
  }
}

function collectCompanionFiles(
  root: string,
  mainPath: string,
  policy?: ContextContentPolicy
): {
  files: ContextFile[];
  contentByPath: Record<string, string>;
  issues: ContextSchemaIssue[];
} {
  const files: ContextFile[] = [];
  const contentByPath: Record<string, string> = {};
  const issues: ContextSchemaIssue[] = [];
  walkCompanions(root, path.dirname(mainPath), mainPath, files, contentByPath, issues, policy);
  return { files: files.sort((left, right) => left.path.localeCompare(right.path)), contentByPath, issues };
}

function walkCompanions(
  root: string,
  directory: string,
  mainPath: string,
  files: ContextFile[],
  contentByPath: Record<string, string>,
  issues: ContextSchemaIssue[],
  policy?: ContextContentPolicy
): void {
  for (const item of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const itemPath = path.join(directory, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      if (itemPath !== path.dirname(mainPath) && containsEntryDocument(itemPath)) continue;
      walkCompanions(root, itemPath, mainPath, files, contentByPath, issues, policy);
      continue;
    }
    if (!item.isFile() || itemPath === mainPath || ["doc.md", "skill.md"].includes(item.name.toLowerCase())) continue;
    const relative = relativeContextPath(root, itemPath);
    if (!relative || contextFileRole(relative) === "other") continue;
    const safePath = relative
      ? resolveContextFile(root, relative)
      : invalidResult<string>([{ path: itemPath, code: "path", message: "companion path is outside source" }]);
    if (!safePath.valid) {
      issues.push(...safePath.issues);
      continue;
    }
    const content = readFileSync(itemPath, "utf8");
    const contentResult = validateCompanionContent(itemPath, content, policy);
    if (!contentResult.valid) {
      issues.push(...contentResult.issues);
      continue;
    }
    files.push(createContextFile(root, itemPath, contextFileRole(relative!), 0));
    contentByPath[relative!] = content;
  }
}

function containsEntryDocument(directory: string): boolean {
  return readdirSync(directory, { withFileTypes: true }).some((item) => item.isFile() && ["doc.md", "skill.md"].includes(item.name.toLowerCase()));
}

function createContextFile(root: string, filePath: string, role: ContextFile["role"], revision: number): ContextFile {
  const relative = relativeContextPath(root, filePath);
  if (!relative) throw new Error(`Context file is outside source root: ${filePath}`);
  const content = readFileSync(filePath, "utf8");
  return {
    schemaVersion: 1,
    revision,
    path: relative,
    role,
    contentHash: hashContextText(content),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    updatedAt: companionUpdatedAt(filePath)
  };
}

function createEntries(documents: DiscoveredDocument[], source: ContextSourceConfig): BuiltContextDocument[] {
  const variants = documents.flatMap((document) => {
    const languages = document.parsed.frontmatter.languages.length ? document.parsed.frontmatter.languages : [undefined];
    const versions = document.parsed.frontmatter.versions.length ? document.parsed.frontmatter.versions : [undefined];
    return languages.flatMap((language) => versions.map((packageVersion) => ({ document, language, packageVersion })));
  });
  const counts = new Map<string, number>();
  for (const variant of variants) {
    const canonicalId = variant.document.parsed.frontmatter.name;
    counts.set(canonicalId, (counts.get(canonicalId) ?? 0) + 1);
  }
  return variants.map((variant) => {
    const frontmatter = variant.document.parsed.frontmatter;
    const canonicalId = frontmatter.name;
    const variantKey = [variant.language ?? "", variant.packageVersion ?? "", frontmatter.apiVersion ?? ""].join("|");
    const sourceId = `${source.name}/${canonicalId}`;
    const id = (counts.get(canonicalId) ?? 0) === 1 ? sourceId : `${sourceId}@${slug(variantKey)}`;
    const entryHash = hashContextValue({
      body: hashContextText(
        frontmatter.name + "\n" + variant.document.contentByPath[relativeContextPath(variant.document.sourceRoot, variant.document.mainPath)!]
      ),
      files: variant.document.files,
      language: variant.language,
      packageVersion: variant.packageVersion,
      apiVersion: frontmatter.apiVersion
    });
    const provenance = {
      schemaVersion: 1 as const,
      revision: 0,
      sourceName: source.name,
      sourceTrustLevel: source.trustLevel,
      entryId: id,
      ...(variant.packageVersion ? { packageVersion: variant.packageVersion } : {}),
      contentRevision: frontmatter.revision,
      contentHash: entryHash,
      verified: false
    };
    const entry: ContextEntry = {
      schemaVersion: 1,
      revision: 0,
      id,
      canonicalId,
      variantKey,
      ...(frontmatter.apiVersion ? { apiVersion: frontmatter.apiVersion } : {}),
      name: frontmatter.name,
      description: frontmatter.description,
      kind: frontmatter.kind,
      tags: frontmatter.tags,
      ...(variant.language ? { language: variant.language } : {}),
      ...(variant.packageVersion ? { packageVersion: variant.packageVersion } : {}),
      contentRevision: frontmatter.revision,
      updatedAt: frontmatter.updatedAt,
      sourceName: source.name,
      trustLevel: source.trustLevel,
      files: variant.document.files,
      contentHash: entryHash,
      provenance
    };
    return { ...variant.document, entry };
  });
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  );
}
