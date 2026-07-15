import path from "node:path";
import type { ContextPackage, TaskType } from "../core/types.js";
import { buildApplicationContext } from "./context-service.js";
import { renderTaskPlan, writeTaskContextPack } from "../outputs/task-harness.js";
import { renderTaskContext, type TaskContextOptions } from "../outputs/task-context.js";
import { writeTaskRun, type TaskRunManifest } from "../outputs/task-run.js";

export interface ApplicationTaskInput extends TaskContextOptions {
  repo: string;
  task: string;
  type?: TaskType;
  base?: string;
}

export async function planApplicationTask(input: ApplicationTaskInput): Promise<{ context: ContextPackage; markdown: string }> {
  const context = await buildApplicationContext(input.repo);
  return {
    context,
    markdown: renderTaskPlan(context, input.task, { type: input.type ?? "auto", tokenBudget: input.tokenBudget })
  };
}

export async function packApplicationTask(input: ApplicationTaskInput) {
  const context = await buildApplicationContext(input.repo);
  const result = writeTaskContextPack(context, input.task, { type: input.type ?? "auto", tokenBudget: input.tokenBudget });
  return {
    context,
    task: input.task,
    taskId: result.taskId,
    dir: path.relative(context.scan.root, result.dir).replaceAll("\\", "/"),
    files: result.files.map((file) => path.relative(context.scan.root, file).replaceAll("\\", "/")),
    markdown: renderTaskContext(context, input.task, { type: input.type ?? "auto", tokenBudget: input.tokenBudget })
  };
}

export async function startApplicationTask(input: ApplicationTaskInput): Promise<{
  context: ContextPackage;
  run: ReturnType<typeof writeTaskRun>;
  manifest: TaskRunManifest;
}> {
  const context = await buildApplicationContext(input.repo);
  const run = writeTaskRun(context, input.task, {
    type: input.type ?? "auto",
    tokenBudget: input.tokenBudget,
    base: input.base ?? "main"
  });
  return { context, run, manifest: run.manifest };
}
