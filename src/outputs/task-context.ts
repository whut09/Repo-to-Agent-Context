import type { ContextPackage, IndexedFile, TaskPack, TaskPackFile, TaskType } from "../core/types.js";
import { estimateTokens } from "../core/token-estimator.js";
import { buildRegressionReport } from "../harness/verification-plane/guards/regression.js";
import { bullet, code, heading, table } from "./renderers/markdown.js";

export interface TaskContextOptions {
  type?: TaskType;
  tokenBudget?: number;
}

export function renderTaskContext(context: ContextPackage, task: string, options: TaskContextOptions = {}): string {
  const pack = buildTaskPack(context, task, options);
  const fileMap = new Map(context.index.files.map((file) => [file.path, file]));
  return [
    heading(1, `Task Context: ${task}`),
    "",
    `Type: ${pack.type}`,
    `Budget: ${pack.estimatedTokens.toLocaleString()} / ${pack.tokenBudget.toLocaleString()} estimated tokens`,
    "",
    heading(2, "Read First"),
    orderedFiles(pack.readFirst, fileMap),
    "",
    heading(2, "Then Inspect If Needed"),
    bullet(pack.inspectIfNeeded.map((item) => `${code(item.path)} - ${item.reasons.slice(0, 2).join(", ")}`)),
    "",
    heading(2, "Why These Files"),
    table(
      ["File", "Category", "Tokens", "Why", "Summary"],
      pack.files.map((item) => [
        code(item.path),
        item.category,
        item.estimatedTokens.toLocaleString(),
        item.reasons.join(", "),
        (fileMap.get(item.path)?.summary ?? "").replace(/\|/g, "\\|")
      ])
    ),
    "",
    heading(2, "Budget Packing"),
    table(
      ["Bucket", "Tokens", "Files"],
      pack.budget.buckets.map((bucket) => [bucket.label, bucket.tokens.toLocaleString(), bucket.files.map(code).join(", ") || "none"])
    ),
    "",
    `Remaining budget: ${pack.budget.remaining.toLocaleString()} estimated tokens`,
    "",
    heading(2, "Suggested Commands"),
    bullet(pack.suggestedCommands),
    "",
    heading(2, "Anti-Regression Notes"),
    bullet(pack.regression.antiRegressionNotes),
    "",
    heading(2, "Required Regression Tests"),
    bullet(pack.regression.requiredTests.map(code)),
    "",
    heading(2, "Suggested Agent Workflow"),
    bullet(workflowFor(pack.type))
  ].join("\n");
}

export function buildTaskPack(context: ContextPackage, task: string, options: TaskContextOptions = {}): TaskPack {
  const type = resolveTaskType(task, options.type ?? "auto");
  const tokenBudget = options.tokenBudget ?? Math.min(context.config.tokenBudget, 12000);
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const terms =
    task
      .toLowerCase()
      .match(/[\p{L}\p{N}_/-]+/gu)
      ?.filter((term) => term.length >= 2) ?? [];
  const translatedTerms = expandTaskTerms(terms);
  const regression = buildRegressionReport(context, { task });
  const fileTerms = new Map<string, string[]>();
  const frequencies = new Map<string, number>();

  for (const file of context.index.files) {
    const haystack = taskHaystack(file);
    const tokens = haystack.match(/[\p{L}\p{N}_/-]+/gu) ?? [];
    fileTerms.set(file.path, tokens);
    const tokenSet = new Set(tokens);
    for (const term of translatedTerms) {
      if (tokenSet.has(term) || (term.length >= 4 && tokens.some((candidate) => candidate.includes(term)))) {
        frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      }
    }
  }

  for (const file of context.index.files) {
    const haystackTerms = fileTerms.get(file.path) ?? [];
    const termSet = new Set(haystackTerms);
    const matches = translatedTerms.filter((term) => termSet.has(term) || (term.length >= 4 && haystackTerms.some((candidate) => candidate.includes(term))));
    const lexicalScore = matches.reduce((sum, term) => {
      const frequency = frequencies.get(term) ?? context.index.files.length;
      return sum + Math.max(5, Math.round(fieldWeight(file, term) * Math.log((context.index.files.length + 1) / (frequency + 1))));
    }, 0);
    if (matches.length) addScore(scores, file.path, lexicalScore, [`lexical match: ${matches.slice(0, 4).join(", ")}`]);
  }

  addRegressionSignals(context, regression.matches, regression.requiredTests, scores);

  const direct = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 8)
    .map(([path]) => path);
  const graphExpansion = expandGraph(context, direct, scores);
  addTaskSignals(context, direct, type, scores);

  if (!direct.length || !scores.size) {
    for (const file of context.keyFiles.slice(0, 10)) addScore(scores, file.path, file.importanceScore, ["key file fallback"]);
  }

  const ranked = [...scores.entries()]
    .map(([path, item]) => ({
      path,
      ...item,
      file: context.index.files.find((file) => file.path === path),
      direct: direct.includes(path)
    }))
    .filter((item): item is typeof item & { file: IndexedFile } => Boolean(item.file))
    .sort(
      (a, b) =>
        categoryPriority(categoryFor(a.file, a.direct, context, a.reasons)) - categoryPriority(categoryFor(b.file, b.direct, context, b.reasons)) ||
        b.score - a.score ||
        b.file.importanceScore - a.file.importanceScore
    );

  const selected = regressionMemoryFiles(regression.matches);
  let estimatedTokens = selected.reduce((sum, file) => sum + file.estimatedTokens, 0);
  for (const item of ranked) {
    const tokens = taskFileTokens(item.file);
    if (selected.length && estimatedTokens + tokens > tokenBudget) continue;
    selected.push({
      path: item.path,
      score: item.score,
      reasons: item.reasons,
      category: categoryFor(item.file, item.direct, context, item.reasons),
      estimatedTokens: tokens
    });
    estimatedTokens += tokens;
  }

  const budget = buildBudget(tokenBudget, selected);
  const suggested = dedupe([...suggestedCommands(context, type, terms), ...regression.requiredTests]);
  return {
    task,
    type,
    tokenBudget,
    estimatedTokens,
    remainingBudget: budget.remaining,
    files: selected,
    readFirst: selected.filter((file) => file.category === "direct-source" || file.category === "entrypoint").slice(0, 8),
    inspectIfNeeded: selected.filter((file) => file.category !== "direct-source" && file.category !== "entrypoint").slice(0, 16),
    budget,
    suggestedCommands: suggested,
    regression: {
      matchedIssues: regression.matches.length,
      antiRegressionNotes: regression.notes,
      requiredTests: regression.requiredTests
    },
    retrieval: {
      directMatches: direct.length,
      dependencyNeighbors: graphExpansion,
      tests: selected.filter((file) => file.category === "test").length,
      configDocs: selected.filter((file) => file.category === "config-doc").length
    }
  };
}

function addRegressionSignals(
  context: ContextPackage,
  matches: ReturnType<typeof buildRegressionReport>["matches"],
  requiredTests: string[],
  scores: Map<string, { score: number; reasons: string[] }>
): void {
  for (const match of matches) {
    for (const file of match.files) {
      if (context.index.files.some((item) => item.path === file)) addScore(scores, file, 72, [`regression memory: ${match.id}`]);
    }
  }
  for (const command of requiredTests) {
    for (const file of context.index.files) {
      if (command.includes(file.path)) addScore(scores, file.path, 64, ["required regression test"]);
    }
  }
}

function regressionMemoryFiles(matches: ReturnType<typeof buildRegressionReport>["matches"]): TaskPackFile[] {
  const fileBySource = {
    "known-issues": ".agent-context/regression/known-issues.json",
    "fix-history": ".agent-context/regression/fix-history.json",
    "fragile-modules": ".agent-context/regression/fragile-modules.json",
    "anti-regression-tests": ".agent-context/regression/anti-regression-tests.json"
  } as const;
  return [...new Set(matches.map((match) => fileBySource[match.source]))].map((file) => ({
    path: file,
    score: 90,
    reasons: ["matched regression memory source"],
    category: "config-doc" as const,
    estimatedTokens: estimateTokens(file)
  }));
}

function expandGraph(context: ContextPackage, direct: string[], scores: Map<string, { score: number; reasons: string[] }>): number {
  const directSet = new Set(direct);
  let added = 0;
  for (const edge of context.graph.fileEdges) {
    if (edge.isExternal) continue;
    if (directSet.has(edge.from)) {
      addScore(scores, edge.to, 24, [`direct dependency of ${edge.from}`]);
      added += 1;
    }
    if (directSet.has(edge.to)) {
      addScore(scores, edge.from, 28, [`direct importer of ${edge.to}`]);
      added += 1;
    }
  }
  return added;
}

function addTaskSignals(
  context: ContextPackage,
  direct: string[],
  type: Exclude<TaskType, "auto">,
  scores: Map<string, { score: number; reasons: string[] }>
): void {
  const directFiles = context.index.files.filter((file) => direct.includes(file.path));
  for (const file of context.index.files) {
    if (file.isTest && isRelatedTest(file, directFiles)) addScore(scores, file.path, type === "bugfix" ? 35 : 20, ["related test"]);
    if (context.scan.entrypoints.includes(file.path)) addScore(scores, file.path, type === "feature" ? 22 : 12, ["entrypoint"]);
    if (file.kind === "config") addScore(scores, file.path, type === "feature" ? 16 : 8, ["configuration"]);
    if (file.kind === "docs" && isModuleDoc(file, directFiles)) addScore(scores, file.path, 14, ["owning module documentation"]);
    if (type === "refactor" && (file.imports.length > 3 || file.exports.length > 3)) addScore(scores, file.path, 18, ["shared API/refactor risk"]);
  }
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

function isModuleDoc(docFile: IndexedFile, directFiles: IndexedFile[]): boolean {
  const docPath = docFile.path.toLowerCase();
  return directFiles.some((file) => {
    const moduleName = file.moduleName.toLowerCase();
    return moduleName !== "root" && (docPath.includes(moduleName) || docPath.includes(file.path.split("/").slice(0, -1).join("/").toLowerCase()));
  });
}

function addScore(map: Map<string, { score: number; reasons: string[] }>, path: string, score: number, reasons: string[]): void {
  const current = map.get(path) ?? { score: 0, reasons: [] };
  current.score += score;
  current.reasons.push(...reasons.filter((reason) => !current.reasons.includes(reason)));
  map.set(path, current);
}

function resolveTaskType(task: string, requested: TaskType): Exclude<TaskType, "auto"> {
  if (requested !== "auto") return requested;
  if (/fix|bug|error|fail|timeout|regression|修复|错误|故障|超时/i.test(task)) return "bugfix";
  if (/refactor|split|rename|cleanup|重构|拆分|整理/i.test(task)) return "refactor";
  return "feature";
}

function taskHaystack(file: IndexedFile): string {
  return [
    file.path,
    file.moduleName,
    file.kind,
    file.isTest ? "test spec fixture" : "",
    file.summary,
    ...file.exports,
    ...file.symbols.map((symbol) => `${symbol.name} ${symbol.kind}`),
    ...file.evidence.slice(0, 20).map((item) => item.detail)
  ]
    .join(" ")
    .toLowerCase();
}

function expandTaskTerms(terms: string[]): string[] {
  const aliases: Record<string, string[]> = {
    登录: ["login", "auth", "session", "signin"],
    登陆: ["login", "auth", "session", "signin"],
    认证: ["auth", "session", "token"],
    超时: ["timeout", "expire", "expiration", "ttl", "session"],
    页面: ["page", "route", "component", "view"],
    白屏: ["error", "render", "page", "component"],
    测试: ["test", "spec"],
    配置: ["config", "setting"],
    重构: ["refactor", "split", "cleanup"],
    修复: ["fix", "bug", "error"]
  };
  return [
    ...new Set(
      terms.flatMap((term) => [
        term,
        ...(aliases[term] ?? []),
        ...Object.entries(aliases)
          .filter(([key]) => term.includes(key))
          .flatMap(([, values]) => values)
      ])
    )
  ];
}

function fieldWeight(file: IndexedFile, term: string): number {
  const path = file.path.toLowerCase();
  if (path.includes(term)) return 68;
  if (file.moduleName.toLowerCase().includes(term)) return 58;
  if (file.exports.some((value) => value.toLowerCase().includes(term))) return 56;
  if (file.symbols.some((symbol) => symbol.name.toLowerCase().includes(term))) return 52;
  if (file.isTest) return 42;
  if (file.kind === "docs") return 34;
  return 40;
}

function categoryFor(file: IndexedFile, direct: boolean, context: ContextPackage, reasons: string[]): TaskPackFile["category"] {
  if (context.scan.entrypoints.includes(file.path)) return "entrypoint";
  if (file.isTest) return "test";
  if (file.kind === "config" || file.kind === "docs") return "config-doc";
  if (direct || reasons.includes("key file fallback")) return "direct-source";
  return "dependency-neighbor";
}

function categoryPriority(category: TaskPackFile["category"]): number {
  return {
    "direct-source": 0,
    entrypoint: 1,
    test: 2,
    "dependency-neighbor": 3,
    "config-doc": 4
  }[category];
}

function taskFileTokens(file: IndexedFile): number {
  return estimateTokens(
    [file.path, file.summary, file.importanceReasons.join(", "), file.exports.join(", "), file.symbols.map((symbol) => symbol.name).join(", ")].join("\n")
  );
}

function buildBudget(total: number, files: TaskPackFile[]): TaskPack["budget"] {
  const definitions: Array<{ name: TaskPack["budget"]["buckets"][number]["name"]; label: string; categories: TaskPackFile["category"][] }> = [
    { name: "direct-source", label: "Directly relevant source files", categories: ["direct-source"] },
    { name: "tests", label: "Tests", categories: ["test"] },
    { name: "dependency-neighbors", label: "Dependency neighbors", categories: ["dependency-neighbor"] },
    { name: "config-docs", label: "Config/docs", categories: ["config-doc"] },
    { name: "entrypoints", label: "Entrypoints", categories: ["entrypoint"] }
  ];
  const buckets = definitions.map((definition) => {
    const bucketFiles = files.filter((file) => definition.categories.includes(file.category));
    return {
      name: definition.name,
      label: definition.label,
      tokens: bucketFiles.reduce((sum, file) => sum + file.estimatedTokens, 0),
      files: bucketFiles.map((file) => file.path)
    };
  });
  const used = files.reduce((sum, file) => sum + file.estimatedTokens, 0);
  return { total, used, remaining: Math.max(0, total - used), buckets };
}

function suggestedCommands(context: ContextPackage, type: Exclude<TaskType, "auto">, terms: string[]): string[] {
  const commands = new Set<string>();
  for (const command of context.scan.testCommands.slice(0, 2)) commands.add(command);
  if (type === "feature" || type === "refactor") {
    for (const command of context.scan.typecheckCommands.slice(0, 1)) commands.add(command);
    for (const command of context.scan.lintCommands.slice(0, 1)) commands.add(command);
  }
  if (!commands.size && context.scan.runCommands[0]) commands.add(context.scan.runCommands[0]);
  if (!commands.size) commands.add("No test command detected; inspect package scripts or project docs before editing.");

  const focused = focusHint([...commands][0], terms);
  return focused ? [focused, ...[...commands].slice(1)] : [...commands];
}

function focusHint(command: string, terms: string[]): string | null {
  if (!terms.length || command.startsWith("No test command")) return null;
  const likelyTerm = terms.find((term) => /^[A-Za-z0-9_-]+$/.test(term) && term.length >= 4);
  return likelyTerm && /test|vitest|jest|pytest|node --test/i.test(command) ? `${command} -- ${likelyTerm}` : command;
}

function orderedFiles(files: TaskPackFile[], fileMap: Map<string, IndexedFile>): string {
  if (!files.length) return "- No direct source files fit the current budget.";
  return files.map((item, index) => `${index + 1}. ${code(item.path)} - ${readFirstReason(item, fileMap.get(item.path))}`).join("\n");
}

function readFirstReason(item: TaskPackFile, file?: IndexedFile): string {
  const symbol = file?.symbols.find((candidate) => candidate.kind !== "unknown")?.name;
  if (symbol) return `${item.reasons.slice(0, 2).join(", ")}; defines ${symbol}`;
  return item.reasons.slice(0, 2).join(", ") || item.category;
}

function workflowFor(type: Exclude<TaskType, "auto">): string[] {
  const common = [
    "Read `AGENTS.md` and inspect evidence before editing.",
    "Open the selected files and dependency neighbors.",
    "Run detected test/check commands after edits."
  ];
  if (type === "bugfix") return ["Reproduce the failure and inspect related tests first.", ...common];
  if (type === "refactor") return ["Preserve exported APIs and inspect callers before moving code.", ...common];
  return ["Confirm the intended behavior and entrypoint integration before implementation.", ...common];
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
