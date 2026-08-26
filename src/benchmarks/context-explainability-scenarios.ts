import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ContextExplainabilityScenarioDefinition, ExplainabilityScenario } from "./context-explainability-types.js";

const SCENARIOS = new Set<ExplainabilityScenario>(["positive", "similar-unrelated", "stale-context", "wrong-annotation", "wrong-command", "success-then-edit"]);

export function readContextExplainabilityScenarios(benchmarkDir: string): ContextExplainabilityScenarioDefinition[] {
  const filePath = path.join(path.resolve(benchmarkDir), "context-explainability", "scenarios.json");
  if (!existsSync(filePath)) throw new Error(`Context explainability scenarios are missing: ${filePath}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Context explainability scenarios are invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateContextExplainabilityScenarios(parsed);
}

export function validateContextExplainabilityScenarios(value: unknown): ContextExplainabilityScenarioDefinition[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Context explainability scenarios must be a non-empty array.");
  const scenarios = value.map((item, index) => validateScenario(item, index));
  const duplicateIds = scenarios.map((item) => item.id).filter((id, index, values) => values.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`Context explainability scenario IDs must be unique: ${[...new Set(duplicateIds)].sort().join(", ")}`);
  return scenarios.sort((left, right) => left.id.localeCompare(right.id));
}

function validateScenario(value: unknown, index: number): ContextExplainabilityScenarioDefinition {
  if (!value || typeof value !== "object") throw new Error(`Context explainability scenario ${index} must be an object.`);
  const record = value as Record<string, unknown>;
  const id = requiredString(record.id, index, "id");
  const taskId = requiredString(record.taskId, index, "taskId");
  const fixture = safeRelativePath(requiredString(record.fixture, index, "fixture"), index, "fixture");
  const task = requiredString(record.task, index, "task");
  const taskType = record.taskType;
  if (taskType !== "bugfix" && taskType !== "feature" && taskType !== "refactor") {
    throw new Error(`Context explainability scenario ${index}.taskType must be bugfix, feature, or refactor.`);
  }
  if (typeof record.scenario !== "string" || !SCENARIOS.has(record.scenario as ExplainabilityScenario)) {
    throw new Error(`Context explainability scenario ${index}.scenario is unsupported.`);
  }
  const source = requiredString(record.source, index, "source");
  const packageVersion = requiredString(record.packageVersion, index, "packageVersion");
  if (!Number.isInteger(record.contentRevision) || Number(record.contentRevision) < 1) {
    throw new Error(`Context explainability scenario ${index}.contentRevision must be a positive integer.`);
  }
  const relevantFiles = safePathArray(record.relevantFiles, index, "relevantFiles", true);
  const rejectedFiles = safePathArray(record.rejectedFiles, index, "rejectedFiles", true);
  const negativeExamples = record.negativeExamples === undefined ? undefined : stringArray(record.negativeExamples, index, "negativeExamples", false);
  return {
    id,
    taskId,
    fixture,
    task,
    taskType,
    source,
    packageVersion,
    contentRevision: Number(record.contentRevision),
    scenario: record.scenario as ExplainabilityScenario,
    relevantFiles,
    rejectedFiles,
    ...(negativeExamples ? { negativeExamples } : {})
  };
}

function requiredString(value: unknown, index: number, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Context explainability scenario ${index}.${field} must be a non-empty string.`);
  return value.trim();
}

function safePathArray(value: unknown, index: number, field: string, required: boolean): string[] {
  return stringArray(value, index, field, required).map((item) => safeRelativePath(item, index, field));
}

function stringArray(value: unknown, index: number, field: string, required: boolean): string[] {
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Context explainability scenario ${index}.${field} must be ${required ? "a non-empty" : "an"} array of strings.`);
  }
  return [...new Set(value.map((item) => String(item).trim()))].sort((left, right) => left.localeCompare(right));
}

function safeRelativePath(value: string, index: number, field: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Context explainability scenario ${index}.${field} contains path traversal: ${value}`);
  }
  return normalized;
}
