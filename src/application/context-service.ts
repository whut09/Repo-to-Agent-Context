import path from "node:path";
import { buildContextPackage, type BuildOptions } from "../core/context-builder.js";
import type { ContextPackage } from "../core/types.js";
import { writeContextPackage } from "../outputs/renderers/writer.js";

export interface ContextServiceResult {
  context: ContextPackage;
  writtenFiles: string[];
}

export async function buildApplicationContext(repo: string, options: BuildOptions = {}): Promise<ContextPackage> {
  return buildContextPackage(path.resolve(repo), options);
}

export async function buildAndWriteApplicationContext(repo: string, options: BuildOptions = {}): Promise<ContextServiceResult> {
  const context = await buildApplicationContext(repo, options);
  const result = writeContextPackage(context);
  return {
    context,
    writtenFiles: result.files.map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/"))
  };
}
