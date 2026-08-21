import type { GuardGateAction, GuardGateReport } from "../../outputs/guard-gates.js";
import type { ArtifactRef, HarnessDecision, HarnessDecisionAction, HarnessDecisionCandidate } from "../types.js";
import { createHarnessDecision } from "../types.js";
import type { LoopControllerReport } from "./loop-controller.js";
import type { PolicyEngineReport } from "../verification-plane/policy-engine.js";

export const HARNESS_DECISION_PRIORITY: Record<HarnessDecisionAction, number> = {
  rollback: 100,
  block: 90,
  repack: 80,
  repair: 70,
  "run-tests": 65,
  "human-review": 60,
  "executor-failure": 95,
  "no-progress": 110,
  "max-loops-reached": 105,
  finalize: 10
};

export interface DecisionEngineInput {
  executorResult: {
    exitCode: number | null;
    stderr?: string;
  };
  changedFiles: string[];
  policy: PolicyEngineReport;
  loop: LoopControllerReport;
  guardGates: GuardGateReport;
  checkpointMode: "none" | "git-worktree";
  artifacts?: ArtifactRef[];
}

export function decideHarnessAction(input: DecisionEngineInput): HarnessDecision {
  return arbitrateDecisionCandidates(collectDecisionCandidates(input));
}

export function collectDecisionCandidates(input: DecisionEngineInput): HarnessDecisionCandidate[] {
  const artifacts = input.artifacts ?? [];
  const candidates: HarnessDecisionCandidate[] = [];

  if (input.executorResult.exitCode !== 0) {
    candidates.push(
      candidate({
        id: "executor.failure",
        source: "executor",
        action: "executor-failure",
        confidence: 0.94,
        reasons: [
          "The selected executor failed before the harness could trust the result.",
          `executor exit code: ${input.executorResult.exitCode ?? "unknown"}`,
          input.executorResult.stderr ? "executor stderr captured" : "executor stderr empty"
        ],
        artifacts
      })
    );
  }

  if (input.policy.summary.forbidden > 0) {
    candidates.push(
      candidate({
        id: "policy.forbidden",
        source: "policy",
        action: input.checkpointMode === "git-worktree" ? "rollback" : "block",
        confidence: 0.96,
        reasons: [
          "Forbidden policy findings were detected in the diff.",
          `forbidden findings: ${input.policy.summary.forbidden}`,
          `policy fail-on: ${input.policy.failOn}`
        ],
        artifacts
      })
    );
  }

  for (const gate of input.guardGates.gates.filter((item) => item.status === "blocked")) {
    candidates.push(
      candidate({
        id: `guard-gate.${gate.id}`,
        source: "guard-gate",
        action: decisionForGate(gate.action, input.checkpointMode),
        confidence: 0.93,
        reasons: [`${gate.guard} guard blocked: ${gate.condition}.`, `guard: ${gate.guard}`, `condition: ${gate.condition}`, ...gate.evidence.slice(0, 5)],
        requiredCommands: commandForGate(gate.action),
        artifacts
      })
    );
  }

  for (const loopDecision of input.loop.decisions.filter((item) => item.blocking)) {
    const action = actionForLoopDecision(loopDecision.action);
    if (!action) continue;
    candidates.push(
      candidate({
        id: `loop.${loopDecision.action}`,
        source: "loop",
        action,
        confidence: loopDecision.confidence,
        reasons: [loopReasonPrefix(action), loopDecision.reason, ...loopDecision.signals],
        requiredCommands: loopDecision.command ? [loopDecision.command] : [],
        artifacts
      })
    );
  }

  if (input.policy.summary.requiredMissing > 0) {
    candidates.push(
      candidate({
        id: "policy.required-missing",
        source: "policy",
        action: "repair",
        confidence: 0.88,
        reasons: ["Required policy evidence is missing.", `required missing: ${input.policy.summary.requiredMissing}`],
        requiredCommands: requiredCommandsFromPolicy(input.policy),
        artifacts
      })
    );
  }

  if (input.loop.risk === "High" || input.policy.summary.risks > 0) {
    candidates.push(
      candidate({
        id: "risk.human-review",
        source: "risk",
        action: "human-review",
        confidence: 0.82,
        reasons: [
          "The diff has high-impact or risk policy signals even though hard gates passed.",
          `impact risk: ${input.loop.risk}`,
          `policy risks: ${input.policy.summary.risks}`
        ],
        artifacts
      })
    );
  }

  if (!candidates.length) {
    candidates.push(
      candidate({
        id: "fallback.finalize",
        source: "fallback",
        action: "finalize",
        blocking: false,
        confidence: input.changedFiles.length ? 0.8 : 0.72,
        reasons: [
          "No blocking policy, context, impact, or verification signals remain.",
          `changed files: ${input.changedFiles.length}`,
          `loop status: ${input.loop.status}`,
          "policy: passed"
        ],
        artifacts
      })
    );
  }

  return candidates.map(normalizeCandidate).sort(compareCandidates);
}

export function arbitrateDecisionCandidates(candidates: HarnessDecisionCandidate[]): HarnessDecision {
  if (!candidates.length) throw new Error("Decision arbitration requires at least one candidate.");
  const sorted = candidates.map(normalizeCandidate).sort(compareCandidates);
  const selected = sorted[0];
  if (!selected) throw new Error("Decision arbitration did not select a candidate.");
  const supporting = sorted.slice(1);
  return decision({
    action: selected.action,
    blocking: selected.blocking,
    confidence: selected.confidence,
    reasons: [...selected.reasons, ...supporting.map(supportingReason)],
    requiredCommands: sorted.flatMap((item) => item.requiredCommands),
    artifacts: sorted.flatMap((item) => item.artifacts),
    arbitration: {
      selectedCandidate: selected,
      selectedPriority: selected.priority,
      supportingCandidates: supporting
    }
  });
}

export function maxLoopHarnessDecision(maxLoops: number, lastDecision: HarnessDecision): HarnessDecision {
  return decision({
    action: "max-loops-reached",
    blocking: true,
    confidence: 0.9,
    reasons: [
      `Maximum orchestrator loop count (${maxLoops}) reached before the harness could finalize.`,
      `max loops: ${maxLoops}`,
      `last action: ${lastDecision.action}`,
      ...lastDecision.reasons
    ],
    requiredCommands: lastDecision.requiredCommands,
    artifacts: lastDecision.artifacts,
    arbitration: lastDecision.arbitration
  });
}

export function noProgressHarnessDecision(fingerprint: string, lastDecision: HarnessDecision): HarnessDecision {
  return decision({
    action: "no-progress",
    blocking: true,
    confidence: 0.94,
    reasons: [
      "No progress was detected across consecutive orchestrator iterations.",
      "stop reason: repeated-state/no-progress",
      `repeated fingerprint: ${fingerprint}`,
      `repeated action: ${lastDecision.action}`,
      ...lastDecision.reasons
    ],
    requiredCommands: lastDecision.requiredCommands,
    artifacts: lastDecision.artifacts,
    arbitration: lastDecision.arbitration
  });
}

function decision(
  input: Omit<HarnessDecision, "requiredCommands" | "artifacts"> & { requiredCommands?: string[]; artifacts?: ArtifactRef[] }
): HarnessDecision {
  return createHarnessDecision({
    action: input.action,
    blocking: input.blocking,
    confidence: input.confidence,
    reasons: input.reasons,
    requiredCommands: input.requiredCommands ?? [],
    artifacts: input.artifacts ?? [],
    ...(input.arbitration ? { arbitration: input.arbitration } : {})
  });
}

function candidate(
  input: Omit<HarnessDecisionCandidate, "priority" | "blocking" | "requiredCommands" | "artifacts"> & {
    blocking?: boolean;
    requiredCommands?: string[];
    artifacts?: ArtifactRef[];
  }
): HarnessDecisionCandidate {
  return {
    id: input.id,
    source: input.source,
    action: input.action,
    priority: HARNESS_DECISION_PRIORITY[input.action],
    blocking: input.blocking ?? input.action !== "finalize",
    confidence: input.confidence,
    reasons: input.reasons,
    requiredCommands: input.requiredCommands ?? [],
    artifacts: input.artifacts ?? []
  };
}

function normalizeCandidate(input: HarnessDecisionCandidate): HarnessDecisionCandidate {
  return {
    ...input,
    priority: HARNESS_DECISION_PRIORITY[input.action],
    confidence: Math.round(Math.max(0, Math.min(1, input.confidence)) * 100) / 100,
    reasons: dedupeStrings(input.reasons),
    requiredCommands: dedupeStrings(input.requiredCommands).sort((a, b) => a.localeCompare(b)),
    artifacts: dedupeArtifacts(input.artifacts)
  };
}

function compareCandidates(a: HarnessDecisionCandidate, b: HarnessDecisionCandidate): number {
  return (
    b.priority - a.priority ||
    Number(b.blocking) - Number(a.blocking) ||
    b.confidence - a.confidence ||
    a.id.localeCompare(b.id) ||
    candidateSignature(a).localeCompare(candidateSignature(b))
  );
}

function supportingReason(candidate: HarnessDecisionCandidate): string {
  return `Supporting blocker [${candidate.id}] action=${candidate.action} priority=${candidate.priority}: ${candidate.reasons[0] ?? "no reason provided"}`;
}

function actionForLoopDecision(action: LoopControllerReport["decisions"][number]["action"]): HarnessDecisionAction | null {
  if (action === "rebuild-context" || action === "replan" || action === "expand-context") return "repack";
  if (action === "repair-contracts" || action === "add-or-update-tests") return "repair";
  if (action === "run-tests") return "run-tests";
  return null;
}

function loopReasonPrefix(action: HarnessDecisionAction): string {
  if (action === "repack") return "The next loop needs refreshed or expanded context before continuing.";
  if (action === "repair") return "The next loop must repair code, contracts, or tests before continuing.";
  return "The next loop must run required verification commands before continuing.";
}

function dedupeStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function dedupeArtifacts(items: ArtifactRef[]): ArtifactRef[] {
  const byKey = new Map<string, ArtifactRef>();
  for (const item of items) byKey.set(`${item.kind ?? "other"}:${item.path}`, item);
  return [...byKey.values()].sort((a, b) => `${a.kind ?? "other"}:${a.path}`.localeCompare(`${b.kind ?? "other"}:${b.path}`));
}

function candidateSignature(candidate: HarnessDecisionCandidate): string {
  return JSON.stringify({
    action: candidate.action,
    artifacts: candidate.artifacts,
    reasons: candidate.reasons,
    requiredCommands: candidate.requiredCommands,
    source: candidate.source
  });
}

function decisionForGate(action: GuardGateAction, checkpointMode: "none" | "git-worktree"): HarnessDecisionAction {
  if (action === "rollback") return checkpointMode === "git-worktree" ? "rollback" : "block";
  if (action === "block") return "block";
  if (action === "repack" || action === "expand-context") return "repack";
  if (action === "run-tests" || action === "run-regression-tests") return "run-tests";
  if (action === "repair") return "repair";
  return "human-review";
}

function commandForGate(action: GuardGateAction): string[] {
  if (action === "repack" || action === "expand-context") return ['opencode-plusplus pack "<task>" .'];
  if (action === "run-tests") return ["opencode-plusplus tests . --diff --base main"];
  if (action === "run-regression-tests") return ["opencode-plusplus regression . --base main --trace <trace-id>"];
  if (action === "repair") return ['opencode-plusplus loop "<task>" . --phase repair'];
  return [];
}

function requiredCommandsFromPolicy(policy: PolicyEngineReport): string[] {
  return policy.results.filter((result) => result.blocking).flatMap((result) => result.requiredCommands);
}
