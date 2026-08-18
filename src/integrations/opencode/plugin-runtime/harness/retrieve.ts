import { retrieveApplicationContext } from "../../../../application/retrieval-service.js";
import { loadPluginHarnessContext } from "./context.js";
import type { PluginRetrieveArgs, PluginRetrieveResult } from "./types.js";

export async function retrievePluginHarnessContext(root: string, args: PluginRetrieveArgs): Promise<PluginRetrieveResult> {
  await loadPluginHarnessContext(root);
  const result = await retrieveApplicationContext({
    repo: root,
    task: args.task,
    provider: "static",
    topK: args.topK ?? 8,
    includeTests: true
  });
  return {
    task: args.task,
    hits: result.hits.map((hit) => ({
      path: hit.path,
      score: hit.score,
      reason: hit.reason
    }))
  };
}
