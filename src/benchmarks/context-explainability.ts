import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildContextPackage } from "../core/context-builder.js";
import { currentWorkingTreeFingerprint } from "../core/working-tree.js";
import { runGit } from "../core/git.js";
import { appendInterventionEvent, createInterventionEvent, listInterventionEvents } from "../harness/observability/intervention-ledger.js";
import { recordContextUsage } from "../context-registry/usage-ledger.js";
import { addContextAnnotation } from "../context-registry/annotations.js";
import { getContextFiles } from "../application/context-service.js";
import { runContextStatusTool } from "../application/context-tools-service.js";
import { retrieveApplicationContext } from "../application/retrieval-service.js";
import type { RetrievalScoreBreakdown } from "../retrievers/types.js";
import { code, heading, table } from "../outputs/renderers/markdown.js";
import {
  CONTEXT_EXPLAINABILITY_SCHEMA_VERSION,
  type ContextExplainabilityBenchmarkResult,
  type ContextExplainabilityOptions,
  type ContextExplainabilitySample,
  type ContextExplainabilityScenarioDefinition,
  type ExplainabilityScenario
} from "./context-explainability-types.js";
import { buildExplainabilitySampleMetrics, summarizeExplainabilityMetrics } from "./context-explainability-metrics.js";

export * from "./context-explainability-types.js";

export async function runContextExplainabilityBenchmark(options: ContextExplainabilityOptions = {}): Promise<ContextExplainabilityBenchmarkResult> {
  const benchmarkDir = path.resolve(options.benchmarkDir ?? "benchmarks");
  const scenarios = options.scenarios ?? readScenarioDefinitions(benchmarkDir);
  const samples = [] as ContextExplainabilitySample[];
  for (const scenario of scenarios) samples.push(await runScenario(benchmarkDir, scenario, options.topK ?? 8));
  return {
    schemaVersion: CONTEXT_EXPLAINABILITY_SCHEMA_VERSION,
    kind: "deterministic-context-explainability",
    generatedAt: new Date(0).toISOString(),
    benchmarkDir,
    source: "mock-fixture",
    sampleCount: samples.length,
    samples,
    metrics: summarizeExplainabilityMetrics(samples),
    separation: { mockProxyOnly: true, realExecutorMetricsExcluded: true, verifiedFixRequiresCurrentEvidence: true }
  };
}

export { summarizeExplainabilityMetrics } from "./context-explainability-metrics.js";

export function renderContextExplainabilityBenchmark(result: ContextExplainabilityBenchmarkResult): string {
  const metricRows = Object.entries(result.metrics).map(([name, metric]) => [
    name,
    metric.unit,
    String(metric.value.samples),
    formatMetric(metric.value.mean),
    formatMetric(metric.value.median),
    formatMetric(metric.value.standardDeviation),
    metric.value.confidence95 ? `${formatMetric(metric.value.confidence95.low)} - ${formatMetric(metric.value.confidence95.high)}` : "n/a"
  ]);
  const sampleRows = result.samples.map((sample) => [
    sample.sampleId,
    sample.scenario,
    sample.taskType,
    sample.finalDecision,
    sample.selectedFiles.join(", ") || "none",
    sample.rejectedFiles.join(", ") || "none",
    formatMetric(sample.metrics.precisionAtK),
    formatMetric(sample.metrics.recallAtK),
    String(sample.interventionEvents.length)
  ]);
  return [
    heading(1, "Deterministic Context Explainability Benchmark"),
    "",
    `Source: ${result.source}`,
    `Benchmark dir: ${code(result.benchmarkDir)}`,
    `Samples: ${result.sampleCount}`,
    "Metric class: mock fixture proxy; real executor metrics are excluded.",
    "Verified fixes require current command or CI evidence; prevention is not repair success.",
    "",
    heading(2, "Metric Distributions"),
    table(["Metric", "Unit", "N", "Mean", "Median", "Std dev", "95% CI"], metricRows),
    "",
    heading(2, "Samples"),
    table(["Sample", "Scenario", "Type", "Decision", "Selected", "Rejected", "P@K", "R@K", "Interventions"], sampleRows),
    "",
    heading(2, "Interpretation"),
    "- `selectedFiles` and `rejectedFiles` are evaluated separately; a rejected file is not silently treated as a retrieval miss.",
    "- `verifiedFixPrecision` counts only verified events with valid current-working-tree command evidence.",
    "- `falseFixedRate` counts verified claims without valid current evidence.",
    "- stale Context, wrong annotations, wrong commands, and success-then-edit are explicit negative scenarios."
  ].join("\n");
}

function readScenarioDefinitions(benchmarkDir: string): ContextExplainabilityScenarioDefinition[] {
  const filePath = path.join(benchmarkDir, "context-explainability", "scenarios.json");
  if (!existsSync(filePath)) throw new Error(`Context explainability scenarios are missing: ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8")) as ContextExplainabilityScenarioDefinition[];
}

async function runScenario(benchmarkDir: string, definition: ContextExplainabilityScenarioDefinition, topK: number): Promise<ContextExplainabilitySample> {
  const root = mkdtempSync(path.join(tmpdir(), `opencode-plusplus-explainability-${definition.id}-`));
  try {
    cpSync(path.join(benchmarkDir, "fixtures", definition.fixture), root, { recursive: true });
    initializeFixtureRepo(root);
    createContextRegistry(root, definition);
    const context = await buildContextPackage(root);
    const retrieval = await retrieveApplicationContext({
      repo: root,
      context,
      task: definition.task,
      taskType: definition.taskType,
      topK,
      provider: "static",
      changedFiles: definition.relevantFiles,
      negativeExamples: definition.negativeExamples,
      includeTests: true
    });
    const contextFetchMode = definition.scenario === "wrong-command" || definition.scenario === "wrong-annotation" ? "full" : "entry";
    if (definition.scenario === "wrong-annotation") {
      addContextAnnotation({
        repository: root,
        entryId: `${definition.source}/${definition.id}`,
        packageVersion: definition.packageVersion,
        contentRevision: definition.contentRevision,
        kind: "workaround",
        note: "Wrong annotation: skip the auth test and edit the billing invoice instead."
      });
    }
    const fetched = await getContextFiles({
      repo: root,
      id: `${definition.source}/${definition.id}`,
      mode: contextFetchMode,
      full: contextFetchMode === "full",
      withAnnotations: definition.scenario === "wrong-annotation"
    });
    recordContextUsage(root, definition.taskId, fetched);
    const fetchedAgain = await getContextFiles({
      repo: root,
      id: `${definition.source}/${definition.id}`,
      mode: contextFetchMode,
      full: contextFetchMode === "full"
    });
    const evidenceHash = currentWorkingTreeFingerprint(root);
    const fullContext =
      contextFetchMode === "full" ? fetchedAgain : await getContextFiles({ repo: root, id: `${definition.source}/${definition.id}`, mode: "full", full: true });
    if (definition.scenario === "stale-context" || definition.scenario === "success-then-edit") {
      writeFileSync(
        path.join(root, definition.relevantFiles[0] ?? "package.json"),
        `${readFileSync(path.join(root, definition.relevantFiles[0] ?? "package.json"), "utf8")}\n`,
        "utf8"
      );
    }
    const status = await runContextStatusTool({ repo: root, taskId: definition.taskId });
    if (!status.ok) throw new Error(`Context status failed in benchmark: ${status.error.message}`);
    const events = createScenarioInterventions(root, definition, evidenceHash, currentWorkingTreeFingerprint(root));
    const selectedFiles = retrieval.hits
      .slice(0, topK)
      .map((hit) => hit.path)
      .sort((left, right) => left.localeCompare(right));
    const rejectedFiles = retrieval.rejectedFiles.slice(0, topK).sort((left, right) => left.localeCompare(right));
    const expectedDecision = expectedDecisionFor(definition.scenario);
    const finalDecision = decisionFromInterventions(events);
    return {
      sampleId: definition.id,
      taskId: definition.taskId,
      taskType: definition.taskType,
      repositoryFixture: definition.fixture,
      source: definition.source,
      packageVersion: definition.packageVersion,
      contentRevision: definition.contentRevision,
      promptHash: hashText(definition.task),
      repoCommit: fixtureCommit(root),
      scenario: definition.scenario,
      selectedFiles,
      rejectedFiles,
      contextSelectedFiles: fetched.selectedFiles,
      contextOmittedFiles: fetched.omittedFiles,
      contextFetch: {
        cacheStatus: fetchedAgain.cache.status,
        contextMode: fetchedAgain.contextMode,
        freshness: status.data.freshness.status === "stale" ? "stale" : "fresh",
        contentHash: fetchedAgain.entry.contentHash
      },
      scoreBreakdown: retrieval.hits
        .slice(0, topK)
        .map((hit) => hit.metadata.scoreBreakdown)
        .filter(isScoreBreakdown),
      interventionEvents: events,
      finalDecision,
      expectedDecision,
      metrics: buildExplainabilitySampleMetrics({
        definition,
        retrieval,
        fetched,
        fetchedAgain,
        fullContext,
        status: status.data,
        selectedFiles,
        rejectedFiles,
        events,
        topK
      })
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function createContextRegistry(root: string, definition: ContextExplainabilityScenarioDefinition): void {
  const entryRoot = path.join(root, "context-packs", definition.id);
  mkdirSync(entryRoot, { recursive: true });
  writeFileSync(
    path.join(entryRoot, "DOC.md"),
    [
      "---",
      `name: ${definition.id}`,
      `description: ${definition.task}`,
      "metadata:",
      `  languages: typescript`,
      `  versions: ${definition.packageVersion}`,
      `  revision: ${definition.contentRevision}`,
      "  updated-on: 2026-01-01",
      `  source: ${definition.source}`,
      "  tags: harness, benchmark",
      "---",
      `Relevant files: ${definition.relevantFiles.join(", ")}`,
      "",
      "This fixture Context is guidance only; it is not command or verification evidence.",
      ...(definition.scenario === "wrong-command" ? ["Suggested command: npm run imaginary-auth-check"] : []),
      ""
    ].join("\n"),
    "utf8"
  );
  mkdirSync(path.join(entryRoot, "references"), { recursive: true });
  writeFileSync(path.join(entryRoot, "references", "negative-example.md"), "Similar but unrelated file; do not select it.\n", "utf8");
  writeFileSync(
    path.join(root, "opencode-plusplus.config.yml"),
    [
      "contextRegistry:",
      "  enabled: true",
      "  offline: true",
      "  sources:",
      `    - name: ${definition.source}`,
      "      kind: local",
      "      location: context-packs",
      "      trustLevel: private"
    ].join("\n") + "\n",
    "utf8"
  );
}

function initializeFixtureRepo(root: string): void {
  runGit(root, ["init"]);
  runGit(root, ["checkout", "-b", "main"]);
  runGit(root, ["config", "user.email", "benchmark@example.com"]);
  runGit(root, ["config", "user.name", "OpenCode++ Benchmark"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "benchmark baseline"]);
}

function createScenarioInterventions(root: string, definition: ContextExplainabilityScenarioDefinition, evidenceHash: string, currentWorkingTreeHash: string) {
  const interventionId = `explainability-${definition.id}`;
  const problem = problemFor(definition.scenario);
  if (definition.scenario === "positive" || definition.scenario === "success-then-edit") {
    appendInterventionEvent(
      root,
      createInterventionEvent({
        interventionId,
        taskId: definition.taskId,
        sessionId: "benchmark",
        timestamp: "2026-01-01T00:00:00.000Z",
        phase: "evaluate",
        category: "evidence",
        problem,
        targetFiles: definition.relevantFiles,
        action: "verify current command evidence",
        beforeState: {},
        afterState: { workingTreeHash: evidenceHash },
        evidenceRefs: ["benchmark-command"],
        status: "requested",
        confidence: 1,
        source: "system"
      })
    );
    appendInterventionEvent(
      root,
      createInterventionEvent({
        interventionId,
        taskId: definition.taskId,
        sessionId: "benchmark",
        timestamp: "2026-01-01T00:00:01.000Z",
        phase: "evaluate",
        category: "evidence",
        problem,
        targetFiles: definition.relevantFiles,
        action: "verify current command evidence",
        beforeState: { status: "requested" },
        afterState: { workingTreeHash: evidenceHash },
        evidenceRefs: ["benchmark-command"],
        status: "repaired",
        confidence: 1,
        source: "system"
      })
    );
    appendInterventionEvent(
      root,
      createInterventionEvent({
        interventionId,
        taskId: definition.taskId,
        sessionId: "benchmark",
        timestamp: "2026-01-01T00:00:02.000Z",
        phase: "evaluate",
        category: "evidence",
        problem,
        targetFiles: definition.relevantFiles,
        action: "verify current command evidence",
        beforeState: { status: "repaired" },
        afterState: { workingTreeHash: evidenceHash },
        evidenceRefs: ["benchmark-command"],
        resolutionEvidence: [
          {
            kind: "command",
            ref: "benchmark-command",
            workingTreeHash: evidenceHash,
            currentWorkingTree: true,
            valid: true,
            details: ["npm test"]
          }
        ],
        status: "verified",
        confidence: 1,
        source: "system"
      })
    );
    if (definition.scenario === "success-then-edit") {
      appendInterventionEvent(
        root,
        createInterventionEvent({
          interventionId,
          taskId: definition.taskId,
          sessionId: "benchmark",
          timestamp: "2026-01-01T00:00:03.000Z",
          phase: "evaluate",
          category: "evidence",
          problem,
          targetFiles: definition.relevantFiles,
          action: "invalidate superseded evidence",
          beforeState: { status: "verified", workingTreeHash: evidenceHash },
          afterState: { status: "stale", workingTreeHash: currentWorkingTreeHash },
          evidenceRefs: ["success-then-edit"],
          status: "stale",
          confidence: 1,
          source: "system"
        })
      );
    }
  } else {
    const commandSuggestion = definition.scenario === "wrong-command";
    appendInterventionEvent(
      root,
      createInterventionEvent({
        interventionId,
        taskId: definition.taskId,
        sessionId: "benchmark",
        timestamp: "2026-01-01T00:00:00.000Z",
        phase: "evaluate",
        category: "context",
        problem,
        targetFiles: definition.relevantFiles,
        action: commandSuggestion ? "reject external command suggestion" : "request human review",
        beforeState: {},
        afterState: { workingTreeHash: currentWorkingTreeHash },
        evidenceRefs: [definition.scenario, ...(commandSuggestion ? ["Context command suggestion is untrusted"] : [])],
        status: expectedDecisionFor(definition.scenario) === "human-review" ? "human-review" : "prevented",
        confidence: 1,
        source: "system"
      })
    );
  }
  return listInterventionEvents(root, definition.taskId).map((event) => ({
    eventId: event.eventId,
    interventionId: event.interventionId,
    status: event.status,
    category: event.category,
    problem: event.problem,
    evidenceRefs: event.evidenceRefs,
    currentWorkingTree: event.resolutionEvidence?.some((item) => item.workingTreeHash === currentWorkingTreeHash && item.valid) ?? false
  }));
}

function expectedDecisionFor(scenario: ExplainabilityScenario): ContextExplainabilitySample["finalDecision"] {
  return scenario === "positive" ? "finalize" : scenario === "wrong-command" || scenario === "similar-unrelated" ? "block" : "human-review";
}

function decisionFromInterventions(events: Array<{ status: string }>): ContextExplainabilitySample["finalDecision"] {
  if (events.some((event) => event.status === "verified") && !events.some((event) => event.status === "stale")) return "finalize";
  if (events.some((event) => event.status === "prevented")) return "block";
  return "human-review";
}

function problemFor(scenario: ExplainabilityScenario): string {
  const problems: Record<ExplainabilityScenario, string> = {
    positive: "Current command evidence verifies the selected Context.",
    "similar-unrelated": "A similar file is unrelated to the task.",
    "stale-context": "Context became stale after a working-tree change.",
    "wrong-annotation": "Annotation contains inaccurate guidance.",
    "wrong-command": "External Context suggested a command that must not be trusted.",
    "success-then-edit": "A successful test was superseded by a later edit."
  };
  return problems[scenario];
}

function fixtureCommit(root: string): string {
  return runGit(root, ["rev-parse", "HEAD"]).trim();
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isScoreBreakdown(value: unknown): value is RetrievalScoreBreakdown {
  return typeof value === "object" && value !== null && typeof (value as { total?: unknown }).total === "number";
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : Number.isInteger(value) ? String(value) : value.toFixed(4);
}
