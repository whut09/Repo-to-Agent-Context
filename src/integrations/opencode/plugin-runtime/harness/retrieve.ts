import { retrieveApplicationContext } from "../../../../application/retrieval-service.js";
import { createPluginHarnessResult } from "./protocol.js";
import { loadPluginHarnessContext } from "./context.js";
import { readPluginHarnessSession } from "./session.js";
import type { PluginRetrieveArgs, PluginRetrieveResult } from "./types.js";

export async function retrievePluginHarnessContext(root: string, args: PluginRetrieveArgs): Promise<PluginRetrieveResult> {
  const context = await loadPluginHarnessContext(root);
  const result = await retrieveApplicationContext({
    repo: root,
    task: args.task,
    provider: "static",
    topK: args.topK ?? 8,
    includeTests: true
  });
  const session = readPluginHarnessSession(root, args.sessionId);
  const hits = [...result.hits]
    .map((hit) => ({ path: hit.path, score: hit.score, reason: hit.reason }))
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
    artifacts: context.scan.root ? [".agent-context/manifest.json"] : []
  });
}
