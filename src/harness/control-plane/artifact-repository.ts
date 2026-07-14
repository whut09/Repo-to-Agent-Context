import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export class OrchestratorArtifactRepository {
  constructor(private readonly root: string) {}

  writeJson<T>(filePath: string, value: T): string {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, filePath);
    return this.relative(filePath);
  }

  readJson<T>(reference: string): T {
    const filePath = path.resolve(this.root, reference);
    if (!existsSync(filePath)) throw new Error(`Missing orchestrator artifact: ${reference}`);
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  }

  relative(filePath: string): string {
    return path.relative(this.root, filePath).replaceAll("\\", "/");
  }
}
