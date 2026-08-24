import { retrieveApplicationContext } from "../../../../application/retrieval-service.js";
import { adaptiveTopK } from "../../../../retrievers/types.js";
import { createPluginHarnessResult } from "./protocol.js";
import { loadPluginHarnessContext } from "./context.js";
import { readPluginHarnessSession } from "./session.js";
import type { PluginRetrieveArgs, PluginRetrieveResult } from "./types.js";

export async function retrievePluginHarnessContext(root: string, args: PluginRetrieveArgs): Promise<PluginRetrieveResult> {
  const startedAt = Date.now();
  const context = await loadPluginHarnessContext(root);
  const taskType = args.taskType ?? "auto";
  const topK = adaptiveTopK(taskType, args.topK);
  const result = await retrieveApplicationContext({
    repo: root,
    context,
    task: args.task,
    provider: "static",
    taskType,
    topK,
    includeTests: true
  });
  const session = readPluginHarnessSession(root, args.sessionId);
  const hits = [...result.hits]
    .map((hit) => ({ path: hit.path, score: hit.score, reason: hit.reason, scoreBreakdown: hit.metadata.scoreBreakdown }))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path) || left.reason.localeCompare(right.reason));
  return createPluginHarnessResult(root, {
    ok: true,
    tool: "retrieve",
    summary: hits.length ? `Retrieved ${hits.length} stable context hits for ${args.task}.` : `No context hits found for ${args.task}.`,
    taskId: session?.taskId ?? null,
    sessionId: session?.sessionId ?? null,
    taskIdSource: session ? "session" : "none",
    currentPhase: "retrieve",
    decision: "context-retrieved",
    blocking: false,
    nextAction: session ? "evaluate" : "prepare",
    hits,
    artifacts: context.scan.root ? [".agent-context/manifest.json"] : [],
    performance: {
      durationMs: Date.now() - startedAt,
      cache: context.cacheStats.indexHits > 0 || context.cacheStats.graphHits > 0 ? "hit" : "miss",
      contextMode: context.cacheStats.indexHits > 0 ? "reused" : context.cacheStats.indexMisses > 0 ? "incremental" : "rebuilt",
      selectedFiles: hits.map((hit) => hit.path),
      rejectedFiles: []
    }
  });
}
