import { existsSync } from "node:fs";
import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "../../core/json-store.js";

export class OrchestratorArtifactRepository {
  constructor(private readonly root: string) {}

  writeJson<T>(filePath: string, value: T): string {
    writeJsonAtomic(filePath, value);
    return this.relative(filePath);
  }

  readJson<T>(reference: string): T {
    const filePath = path.resolve(this.root, reference);
    if (!existsSync(filePath)) throw new Error(`Missing orchestrator artifact: ${reference}`);
    return readJsonFile<T>(filePath) as T;
  }

  relative(filePath: string): string {
    return path.relative(this.root, filePath).replaceAll("\\", "/");
  }
}
