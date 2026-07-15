import { existsSync } from "node:fs";
import path from "node:path";
import { readJsonFile } from "../../core/json-store.js";
import { updateJsonAtomic } from "../../core/atomic-store.js";

export class OrchestratorArtifactRepository {
  constructor(private readonly root: string) {}

  writeJson<T extends object>(filePath: string, value: T): string {
    updateJsonAtomic<Record<string, unknown>>(filePath, (current) => ({
      ...value,
      schemaVersion: "schemaVersion" in value ? value.schemaVersion : "opencode-plusplus.artifact.v1",
      revision: typeof current?.revision === "number" ? current.revision + 1 : 1
    }));
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
