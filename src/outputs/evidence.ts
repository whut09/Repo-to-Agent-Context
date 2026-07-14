import type { ExecutionTrace, ExecutionTraceStep } from "../harness/observability/execution-trace.js";

export type EvidenceLevel = "none" | "manual" | "command" | "ci";
export type HarnessRequirementKind = "tests" | "contract-validation";

export interface HarnessRequirement {
  kind: HarnessRequirementKind;
  currentRepoHash: string;
  requiredCommands?: string[];
  requireCurrentTree?: boolean;
  requireAfterLastEdit?: boolean;
}

export interface EvidenceResult {
  satisfied: boolean;
  level: EvidenceLevel;
  stepId?: string;
  stale: boolean;
  matchedCommand?: string;
  evidence: string[];
}

export interface LatestTestResultOptions {
  afterLastEdit?: boolean;
}

export function evidenceSatisfies(requirement: HarnessRequirement, trace: ExecutionTrace | null): EvidenceResult {
  if (!trace) {
    return {
      satisfied: false,
      level: "none",
      stale: false,
      evidence: ["Evidence level: none.", "No execution trace was provided."]
    };
  }

  const lastEdit = lastEditStep(trace);
  const requirementSteps = requirement.kind === "tests" ? latestTestResultSteps(trace) : trace.steps;
  const candidates = requirementSteps
    .filter((step) => matchesRequirement(step, requirement.kind) && stepPassed(step))
    .map((step) => evaluateCandidate(step, requirement, lastEdit))
    .sort((a, b) => evidenceRank(b.level) - evidenceRank(a.level) || stepTime(b.step) - stepTime(a.step));
  const satisfied = candidates.find((candidate) => candidate.satisfied);
  if (satisfied) return resultForCandidate(satisfied, trace.id);

  const best = candidates[0];
  if (!best) {
    return {
      satisfied: false,
      level: "none",
      stale: false,
      evidence: ["Evidence level: none.", `No matching passed ${requirement.kind} trace step found.`]
    };
  }

  return {
    satisfied: false,
    level: best.level,
    stepId: best.step.id,
    stale: best.stale,
    matchedCommand: best.matchedCommand,
    evidence: [`Trace loaded: ${trace.id}.`, ...formatTraceEvidence(best.step, best.level), ...best.reasons]
  };
}

export function evidenceLevelForStep(step: ExecutionTraceStep): EvidenceLevel {
  if (step.evidenceSource === "ci") return "ci";
  if (isHarnessCommandEvidence(step)) return "command";
  return "manual";
}

export function evidenceRank(level: EvidenceLevel): number {
  if (level === "ci") return 3;
  if (level === "command") return 2;
  if (level === "manual") return 1;
  return 0;
}

export function matchesTestStep(step: ExecutionTraceStep): boolean {
  const text = `${step.action} ${step.command ?? ""} ${step.test ?? ""}`.toLowerCase();
  return /\b(run-test|test|verify|check|lint|typecheck)\b/.test(text) || /\b(npm|pnpm|yarn|bun|pytest|vitest|jest|node --test)\b/.test(text);
}

export function latestTestResultSteps(trace: ExecutionTrace, options: LatestTestResultOptions = {}): ExecutionTraceStep[] {
  const lastEditIndex = options.afterLastEdit ? findLastEditIndex(trace) : -1;
  const latest = new Map<string, { index: number; step: ExecutionTraceStep }>();

  for (let index = lastEditIndex + 1; index < trace.steps.length; index += 1) {
    const step = trace.steps[index];
    if (!step || !matchesTestStep(step) || !hasTerminalTestResult(step)) continue;
    latest.set(testResultKey(step), { index, step });
  }

  return [...latest.values()].sort((a, b) => a.index - b.index).map((item) => item.step);
}

export function testStepFailedByExitCode(step: ExecutionTraceStep): boolean {
  return typeof step.exitCode === "number" && step.exitCode !== 0;
}

export function testStepHasFailureOutput(step: ExecutionTraceStep): boolean {
  if (step.result === "passed" || step.exitCode === 0) return false;
  return /fail|failed|error|exception/i.test(step.output ?? "");
}

interface CandidateEvaluation {
  step: ExecutionTraceStep;
  level: EvidenceLevel;
  satisfied: boolean;
  stale: boolean;
  matchedCommand?: string;
  reasons: string[];
}

function evaluateCandidate(step: ExecutionTraceStep, requirement: HarnessRequirement, lastEdit: ExecutionTraceStep | undefined): CandidateEvaluation {
  const level = evidenceLevelForStep(step);
  const reasons: string[] = [];
  let stale = false;
  const matchedCommand = commandMatchFor(step, requirement);

  if (level !== "manual" && (requirement.requiredCommands ?? []).length > 0 && !matchedCommand) {
    reasons.push(`Required command not matched. Expected one of: ${(requirement.requiredCommands ?? []).join(" | ")}.`);
  }

  if (requirement.requireAfterLastEdit !== false && lastEdit && stepTime(step) < stepTime(lastEdit)) {
    stale = true;
    reasons.push(`Evidence step ${step.id} happened before last edit step ${lastEdit.id}.`);
  }

  if (level === "command" || level === "ci") {
    if (step.exitCode !== 0) {
      reasons.push(`Exit code was ${step.exitCode ?? "unknown"}, expected 0.`);
    }
    if (requirement.requireCurrentTree !== false) {
      if (!step.workingTreeHashAfter) {
        reasons.push("No working tree hash was recorded after the command.");
      } else if (step.workingTreeHashAfter !== requirement.currentRepoHash) {
        stale = true;
        reasons.push(`Working tree hash is stale: evidence ${step.workingTreeHashAfter}, current ${requirement.currentRepoHash}.`);
      }
    }
  } else {
    reasons.push("Manual evidence has no command-captured working tree hash.");
  }

  return {
    step,
    level,
    satisfied: reasons.filter((reason) => !reason.startsWith("Manual evidence")).length === 0,
    stale,
    matchedCommand,
    reasons
  };
}

function resultForCandidate(candidate: CandidateEvaluation, traceId: string): EvidenceResult {
  return {
    satisfied: true,
    level: candidate.level,
    stepId: candidate.step.id,
    stale: candidate.stale,
    matchedCommand: candidate.matchedCommand,
    evidence: [`Trace loaded: ${traceId}.`, ...formatTraceEvidence(candidate.step, candidate.level), ...candidate.reasons]
  };
}

function matchesRequirement(step: ExecutionTraceStep, kind: HarnessRequirementKind): boolean {
  if (kind === "tests") return matchesTestStep(step);
  const commandText = `${step.action} ${step.command ?? ""}`.toLowerCase();
  const reasonText = (step.reason ?? "").toLowerCase();
  return commandText.includes("validate-contracts") || commandText.includes("contract validation") || reasonText.includes("contract validation");
}

function commandMatchFor(step: ExecutionTraceStep, requirement: HarnessRequirement): string | undefined {
  const required = (requirement.requiredCommands ?? []).filter((command) => !/^No .*detected/i.test(command));
  if (!required.length) return "no required command configured";
  const actual = normalizeCommand(`${step.action} ${step.command ?? ""} ${step.test ?? ""}`);
  if (requirement.kind === "contract-validation" && actual.includes("validate-contracts")) return step.command ?? step.action;
  if (requirement.kind === "tests" && !step.command && matchesTestStep(step)) return step.action;
  return required.find((command) => commandMatches(actual, normalizeCommand(command)));
}

function commandMatches(actual: string, required: string): boolean {
  if (!actual || !required) return false;
  if (actual === required || actual.includes(required) || required.includes(actual)) return true;
  const actualNpmTest = actual.replace(/^npm test\b/, "npm run test");
  const requiredNpmTest = required.replace(/^npm test\b/, "npm run test");
  if (actualNpmTest === requiredNpmTest || actualNpmTest.includes(requiredNpmTest) || requiredNpmTest.includes(actualNpmTest)) return true;
  const requiredHead = requiredNpmTest.split(/\s+--\s+/)[0];
  return Boolean(requiredHead && actualNpmTest.includes(requiredHead));
}

function normalizeCommand(command: string): string {
  return command
    .toLowerCase()
    .replace(/\bnpm\.cmd\b/g, "npm")
    .replace(/\b(pnpm|yarn|bun)\.cmd\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function stepPassed(step: ExecutionTraceStep): boolean {
  if (step.result === "passed") return true;
  return (step.evidenceSource === "command" || step.evidenceSource === "ci") && step.exitCode === 0;
}

function isHarnessCommandEvidence(step: ExecutionTraceStep): boolean {
  return (
    step.evidenceSource === "command" &&
    step.capturedBy === "opencode-plusplus" &&
    step.exitCode === 0 &&
    Boolean(step.command && step.startedAt && step.finishedAt && step.stdoutHash && step.stderrHash && step.workingTreeHashBefore && step.workingTreeHashAfter)
  );
}

function lastEditStep(trace: ExecutionTrace): ExecutionTraceStep | undefined {
  const index = findLastEditIndex(trace);
  return index >= 0 ? trace.steps[index] : undefined;
}

function findLastEditIndex(trace: ExecutionTrace): number {
  for (let index = trace.steps.length - 1; index >= 0; index -= 1) {
    const step = trace.steps[index];
    if (step && isEditStep(step)) return index;
  }
  return -1;
}

function isEditStep(step: ExecutionTraceStep): boolean {
  if (/edit|modify|write|patch|apply/i.test(step.action)) return true;
  return step.files.some((file) => !file.startsWith(".agent-context/") && file !== "AGENTS.md");
}

function stepTime(step: ExecutionTraceStep): number {
  return Date.parse(step.finishedAt ?? step.at) || 0;
}

function hasTerminalTestResult(step: ExecutionTraceStep): boolean {
  return typeof step.exitCode === "number" || step.result === "passed" || step.result === "failed" || testStepHasFailureOutput(step);
}

function testResultKey(step: ExecutionTraceStep): string {
  if (step.command) return `command:${normalizeTestCommand(step.command)}`;
  if (step.test) return `test:${normalizeCommand(step.test)}`;
  return `action:${normalizeCommand(step.action)}`;
}

function normalizeTestCommand(command: string): string {
  return normalizeCommand(command).replace(/^(npm|pnpm|yarn|bun) test\b/, "$1 run test");
}

function formatTraceEvidence(step: ExecutionTraceStep, level: EvidenceLevel): string[] {
  const evidence = [`Evidence level: ${level}.`, `Trace step: ${step.id}.`, `Action: ${step.action}.`];
  if (step.command) evidence.push(`Command: ${step.command}.`);
  if (typeof step.exitCode === "number") evidence.push(`Exit code: ${step.exitCode}.`);
  if (step.stdoutHash) evidence.push(`Stdout hash: ${step.stdoutHash}.`);
  if (step.stderrHash) evidence.push(`Stderr hash: ${step.stderrHash}.`);
  if (step.workingTreeHashBefore && step.workingTreeHashAfter) {
    evidence.push(`Working tree hash: ${step.workingTreeHashBefore} -> ${step.workingTreeHashAfter}.`);
  }
  return evidence;
}
