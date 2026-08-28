import { existsSync } from "node:fs";
import path from "node:path";
import { buildAndWriteApplicationContext, buildApplicationContext } from "../../../../application/context-service.js";
import { assessFreshness } from "../../../../core/freshness.js";
import { currentWorkingTreeFingerprint } from "../../../../core/working-tree.js";
import type { ContextPackage } from "../../../../core/types.js";

const contextCache = new Map<string, { workingTreeHash: string; context: ContextPackage }>();
const contextBuilds = new Map<string, Promise<ContextPackage>>();

export async function loadPluginHarnessContext(root: string): Promise<ContextPackage> {
  const key = path.resolve(root);
  const workingTreeHash = currentWorkingTreeFingerprint(key);
  const cached = contextCache.get(key);
  if (cached?.workingTreeHash === workingTreeHash && assessFreshness(cached.context).status === "fresh") return cached.context;
  const running = contextBuilds.get(key);
  if (running) return running;
  const build = loadContext(key, workingTreeHash);
  contextBuilds.set(key, build);
  try {
    return await build;
  } finally {
    if (contextBuilds.get(key) === build) contextBuilds.delete(key);
  }
}

async function loadContext(root: string, workingTreeHash: string): Promise<ContextPackage> {
  const contextDir = path.join(root, ".agent-context");
  if (!existsSync(contextDir)) {
    const context = (await buildAndWriteApplicationContext(root)).context;
    contextCache.set(root, { workingTreeHash, context });
    return context;
  }
  const context = await buildApplicationContext(root);
  if (assessFreshness(context).status !== "fresh") {
    const rebuilt = (await buildAndWriteApplicationContext(root)).context;
    contextCache.set(root, { workingTreeHash, context: rebuilt });
    return rebuilt;
  }
  contextCache.set(root, { workingTreeHash, context });
  return context;
}
