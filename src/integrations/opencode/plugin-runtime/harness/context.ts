import { existsSync } from "node:fs";
import path from "node:path";
import { buildAndWriteApplicationContext, buildApplicationContext } from "../../../../application/context-service.js";
import { assessFreshness } from "../../../../core/freshness.js";
import type { ContextPackage } from "../../../../core/types.js";

export async function loadPluginHarnessContext(root: string): Promise<ContextPackage> {
  const contextDir = path.join(root, ".agent-context");
  if (!existsSync(contextDir)) {
    return (await buildAndWriteApplicationContext(root)).context;
  }
  const context = await buildApplicationContext(root);
  if (assessFreshness(context).status !== "fresh") {
    return (await buildAndWriteApplicationContext(root)).context;
  }
  return context;
}
