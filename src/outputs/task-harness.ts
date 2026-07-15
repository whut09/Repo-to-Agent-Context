import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ContextPackage, IndexedFile, TaskPack, TaskPackFile } from "../core/types.js";
import { changedFilesSince, runGit } from "../core/git.js";
import { buildTaskPack, renderTaskContext, type TaskContextOptions } from "./task-context.js";
import { validateContracts } from "./contract-validator.js";
import { buildRegressionReport, renderRegressionReport } from "../harness/verification-plane/guards/regression.js";
import { bullet, code, heading, table } from "./renderers/markdown.js";
import { taskSlug } from "../core/task-id.js";

export interface TaskPackWriteResult {
  taskId: string;
  dir: string;
  files: string[];
  pack: TaskPack;
}

export interface TaskVerifyOptions {
  base?: string;
  diff?: boolean;
  traceId?: string;
}

export function renderTaskPlan(context: ContextPackage, task: string, options: TaskContextOptions = {}): string {
  const pack = buildTaskPack(context, task, options);
  return [
    heading(1, "Task Plan"),
    "",
    heading(2, "Intent"),
    task,
    "",
    heading(2, "Suspected modules"),
    bullet(suspectedModules(context, pack)),
    "",
    heading(2, "Must inspect"),
    bullet(mustInspect(pack).map((file) => code(file.path))),
    "",
    heading(2, "Do not edit unless necessary"),
    bullet(doNotEditUnlessNecessary(context, pack)),
    "",
    heading(2, "Validation commands"),
    bullet(pack.suggestedCommands.map(code)),
    "",
    heading(2, "Anti-regression notes"),
    bullet(pack.regression.antiRegressionNotes),
    "",
    heading(2, "Required regression tests"),
    bullet(pack.regression.requiredTests.map(code))
  ].join("\n");
}

export function writeTaskContextPack(context: ContextPackage, task: string, options: TaskContextOptions = {}): TaskPackWriteResult {
  const pack = buildTaskPack(context, task, options);
  const taskId = taskSlug(task);
  const taskDir = path.join(context.scan.root, ".agent-context", "tasks", taskId);
  mkdirSync(taskDir, { recursive: true });

  const fileMap = fileMapFor(context);
  const outputs: Array<[string, string]> = [
    ["task.md", renderTaskOverview(context, pack)],
    [
      "relevant-files.md",
      renderPackFiles(
        "Relevant Files",
        pack.files.filter((file) => file.category === "direct-source" || file.category === "entrypoint"),
        fileMap
      )
    ],
    [
      "dependency-neighbors.md",
      renderPackFiles(
        "Dependency Neighbors",
        pack.files.filter((file) => file.category === "dependency-neighbor"),
        fileMap
      )
    ],
    [
      "tests.md",
      renderPackFiles(
        "Tests",
        pack.files.filter((file) => file.category === "test"),
        fileMap
      )
    ],
    ["risk.md", renderTaskRisk(context, pack)],
    ["prompt.md", renderTaskPrompt(context, pack)]
  ];

  const files = outputs.map(([name, content]) => {
    const filePath = path.join(taskDir, name);
    writeFileSync(filePath, `${content.trim()}\n`, "utf8");
    return filePath;
  });

  return { taskId, dir: taskDir, files, pack };
}

export function renderTaskVerify(context: ContextPackage, options: TaskVerifyOptions = {}): string {
  const base = options.base ?? "main";
  const changed = changedFilesForVerify(context, base, options.diff ?? true);
  const changedSet = new Set(changed);
  const indexedChanged = changed
    .map((filePath) => context.index.files.find((file) => file.path === filePath))
    .filter((file): file is IndexedFile => Boolean(file));
  const affected = affectedModules(context, indexedChanged);
  const missing = missingTests(context, indexedChanged, changedSet);
  const recommended = recommendedVerifyCommands(context, indexedChanged, affected);
  const risk = verifyRisk(context, indexedChanged, changed, missing, affected);
  const contracts = validateContracts(context, { base, diff: options.diff ?? true });
  const regression = buildRegressionReport(context, { base, traceId: options.traceId, changedFiles: changed });

  return [
    heading(1, "Task Verify"),
    "",
    `Base: ${base}`,
    `Risk score: ${risk.score}/100 (${risk.label})`,
    "",
    heading(2, "Changed files"),
    bullet(changed.map(code)),
    "",
    heading(2, "Affected modules"),
    bullet(affected),
    "",
    heading(2, "Missing tests"),
    bullet(missing),
    "",
    heading(2, "Recommended tests"),
    bullet(recommended.map(code)),
    "",
    heading(2, "Contract check"),
    `Contract check: ${contracts.passed ? "passed" : "failed"}`,
    bullet(contracts.violations.map((violation) => `${violation.severity.toUpperCase()} ${code(violation.file)} - ${violation.reason} (${violation.rule})`)),
    "",
    renderRegressionReport(regression),
    "",
    heading(2, "Risk factors"),
    bullet(risk.factors)
  ].join("\n");
}

function renderTaskOverview(context: ContextPackage, pack: TaskPack): string {
  return [
    heading(1, `Task Pack: ${pack.task}`),
    "",
    `Task id: ${taskSlug(pack.task)}`,
    `Type: ${pack.type}`,
    `Budget: ${pack.estimatedTokens.toLocaleString()} / ${pack.tokenBudget.toLocaleString()} estimated tokens`,
    "",
    heading(2, "Intent"),
    pack.task,
    "",
    heading(2, "Suspected modules"),
    bullet(suspectedModules(context, pack)),
    "",
    heading(2, "Validation commands"),
    bullet(pack.suggestedCommands.map(code)),
    "",
    heading(2, "Anti-regression notes"),
    bullet(pack.regression.antiRegressionNotes),
    "",
    heading(2, "Required regression tests"),
    bullet(pack.regression.requiredTests.map(code))
  ].join("\n");
}

function renderPackFiles(title: string, files: TaskPackFile[], fileMap: Map<string, IndexedFile>): string {
  return [
    heading(1, title),
    "",
    table(
      ["File", "Category", "Tokens", "Why", "Summary"],
      files.map((item) => [
        code(item.path),
        item.category,
        item.estimatedTokens.toLocaleString(),
        item.reasons.join(", ").replace(/\|/g, "\\|"),
        (fileMap.get(item.path)?.summary ?? "").replace(/\|/g, "\\|")
      ])
    )
  ].join("\n");
}

function renderTaskRisk(context: ContextPackage, pack: TaskPack): string {
  return [
    heading(1, "Risk"),
    "",
    heading(2, "Do not edit unless necessary"),
    bullet(doNotEditUnlessNecessary(context, pack)),
    "",
    heading(2, "Regression watchpoints"),
    bullet([...regressionWatchpoints(context, pack), ...pack.regression.antiRegressionNotes])
  ].join("\n");
}

function renderTaskPrompt(context: ContextPackage, pack: TaskPack): string {
  return [
    heading(1, "Agent Prompt"),
    "",
    `Implement this task: ${pack.task}`,
    "",
    "Use this task pack as the edit boundary. Read `task.md`, inspect `relevant-files.md` first, then inspect dependency neighbors and tests as needed.",
    "",
    "Before editing, state the files you intend to touch. Do not edit files listed in `risk.md` unless the task cannot be completed otherwise.",
    "",
    "After editing, run:",
    bullet(pack.suggestedCommands.map(code)),
    "",
    "Then run:",
    code("opencode-plusplus verify --diff ."),
    "",
    "Full context fallback:",
    "",
    renderTaskContext(context, pack.task, { type: pack.type, tokenBudget: pack.tokenBudget })
  ].join("\n");
}

function mustInspect(pack: TaskPack): TaskPackFile[] {
  const selected = [...pack.readFirst];
  for (const file of pack.files.filter((candidate) => candidate.category === "test")) {
    if (!selected.some((item) => item.path === file.path)) selected.push(file);
  }
  return selected.slice(0, 12);
}

function suspectedModules(context: ContextPackage, pack: TaskPack): string[] {
  const paths = new Set(pack.files.slice(0, 12).map((file) => file.path));
  const modules = context.index.files
    .filter((file) => paths.has(file.path))
    .map((file) => file.moduleName)
    .filter((module) => module && module !== "root");
  return dedupe(modules).slice(0, 8);
}

function doNotEditUnlessNecessary(context: ContextPackage, pack: TaskPack): string[] {
  const relevant = new Set(pack.files.map((file) => file.path));
  const items = ["generated files", "lockfiles unless dependency versions are part of the task"];
  if (context.scan.migrationFiles.some((file) => !relevant.has(file))) items.push("database schema and migrations");
  if (
    context.index.modules.some(
      (module) =>
        /payment|billing|checkout|invoice/i.test(`${module.name} ${module.pathPrefix}`) && !pack.files.some((file) => file.path.startsWith(module.pathPrefix))
    )
  ) {
    items.push("payment, billing, checkout, or invoice modules");
  }
  if (context.scan.configFiles.some((file) => !relevant.has(file))) items.push("deployment and infrastructure configuration");
  return dedupe(items);
}

function regressionWatchpoints(context: ContextPackage, pack: TaskPack): string[] {
  const watchpoints = new Set<string>();
  for (const file of pack.files) {
    const indexed = context.index.files.find((candidate) => candidate.path === file.path);
    if (!indexed) continue;
    if (indexed.importanceScore >= 40) watchpoints.add(`${file.path} is high-importance shared context`);
    for (const edge of context.graph.fileEdges.filter((candidate) => candidate.to === file.path && !candidate.isExternal).slice(0, 4)) {
      watchpoints.add(`${edge.from} imports ${file.path}`);
    }
  }
  if (!watchpoints.size) watchpoints.add("No high-risk dependency watchpoints detected from the static graph.");
  return [...watchpoints].slice(0, 10);
}

function changedFilesForVerify(context: ContextPackage, base: string, includeDiff: boolean): string[] {
  const files = new Set<string>();
  if (includeDiff) {
    for (const file of changedFilesSince(context.scan.root, base)) files.add(file);
  }

  for (const file of statusFiles(context.scan.root)) files.add(file);
  return [...files].sort();
}

function statusFiles(root: string): string[] {
  try {
    return runGit(root, ["status", "--porcelain", "--untracked-files=all"])
      .split(/\r?\n/)
      .filter((line) => line.length > 3)
      .map((line) => line.slice(3).trim().replace(/\\/g, "/"))
      .map((line) => (line.includes(" -> ") ? (line.split(" -> ").pop() ?? line) : line))
      .filter((line) => !line.startsWith(".agent-context/"));
  } catch {
    return [];
  }
}

function affectedModules(context: ContextPackage, changed: IndexedFile[]): string[] {
  const paths = new Set(changed.map((file) => file.path));
  const modules = new Set(changed.map((file) => file.moduleName).filter((module) => module && module !== "root"));
  for (const edge of context.graph.fileEdges) {
    if (edge.isExternal) continue;
    if (paths.has(edge.from) || paths.has(edge.to)) {
      const from = context.index.files.find((file) => file.path === edge.from);
      const to = context.index.files.find((file) => file.path === edge.to);
      if (from?.moduleName && from.moduleName !== "root") modules.add(from.moduleName);
      if (to?.moduleName && to.moduleName !== "root") modules.add(to.moduleName);
    }
  }
  return [...modules].sort();
}

function missingTests(context: ContextPackage, changed: IndexedFile[], changedSet: Set<string>): string[] {
  const changedTests = changed.filter((file) => file.isTest);
  const missing: string[] = [];
  for (const file of changed.filter((candidate) => candidate.kind === "source" && !candidate.isTest)) {
    const relatedTests = context.index.files.filter((candidate) => candidate.isTest && isRelatedTest(candidate, [file]));
    const relatedChanged = relatedTests.some((testFile) => changedSet.has(testFile.path)) || changedTests.some((testFile) => isRelatedTest(testFile, [file]));
    if (!relatedChanged) {
      missing.push(
        relatedTests.length
          ? `${file.path} changed without updating related test ${relatedTests[0].path}`
          : `${file.path} changed without a detected related test file`
      );
    }
  }
  return missing;
}

function recommendedVerifyCommands(context: ContextPackage, changed: IndexedFile[], affected: string[]): string[] {
  const commands = new Set<string>();
  const focus = affected
    .find((module) => /^[A-Za-z0-9_-]+$/.test(module.split("/").pop() ?? ""))
    ?.split("/")
    .pop();
  for (const command of context.scan.testCommands.slice(0, 2))
    commands.add(focus && /test|vitest|jest|pytest|node --test/i.test(command) ? `${command} -- ${focus}` : command);
  for (const command of context.scan.typecheckCommands.slice(0, 1)) commands.add(command);
  for (const command of context.scan.lintCommands.slice(0, 1)) commands.add(command);
  if (!commands.size && changed.some((file) => file.kind === "source"))
    commands.add("No test command detected; inspect project docs and run the nearest relevant tests manually.");
  return [...commands];
}

function verifyRisk(
  context: ContextPackage,
  changed: IndexedFile[],
  rawChanged: string[],
  missing: string[],
  affected: string[]
): { score: number; label: string; factors: string[] } {
  let score = 0;
  const factors: string[] = [];
  const sourceCount = changed.filter((file) => file.kind === "source" && !file.isTest).length;
  if (sourceCount) {
    score += Math.min(30, sourceCount * 10);
    factors.push(`${sourceCount} source file${sourceCount === 1 ? "" : "s"} changed`);
  }
  if (missing.length) {
    score += Math.min(30, missing.length * 15);
    factors.push(`${missing.length} changed source file${missing.length === 1 ? "" : "s"} missing changed tests`);
  }
  if (changed.some((file) => file.kind === "config" || context.scan.migrationFiles.includes(file.path))) {
    score += 20;
    factors.push("configuration or migration files changed");
  }
  if (changed.some((file) => file.importanceScore >= 40)) {
    score += 15;
    factors.push("high-importance files changed");
  }
  if (rawChanged.length > 8) {
    score += 10;
    factors.push("large diff surface");
  }
  if (affected.length > 3) {
    score += 10;
    factors.push("multiple affected modules");
  }
  if (!factors.length) factors.push("no indexed source/config changes detected");

  const bounded = Math.min(100, score);
  return { score: bounded, label: bounded >= 70 ? "high" : bounded >= 35 ? "medium" : "low", factors };
}

function isRelatedTest(testFile: IndexedFile, directFiles: IndexedFile[]): boolean {
  const testPath = testFile.path.toLowerCase();
  return directFiles.some((file) => {
    const baseName =
      file.path
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .toLowerCase() ?? "";
    return (
      (baseName.length >= 3 && testPath.includes(baseName)) ||
      (file.moduleName !== "root" && file.moduleName !== "test" && testPath.includes(file.moduleName.toLowerCase()))
    );
  });
}

function fileMapFor(context: ContextPackage): Map<string, IndexedFile> {
  return new Map(context.index.files.map((file) => [file.path, file]));
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
