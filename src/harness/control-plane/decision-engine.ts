import type { GuardGateAction, GuardGateReport } from "../../outputs/guard-gates.js";
import type { ArtifactRef, HarnessDecision, HarnessDecisionAction } from "../types.js";
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
  if (input.executorResult.exitCode !== 0) {
    return decision({
      action: "block",
      blocking: true,
      confidence: 0.94,
      reasons: [
        "The selected executor failed before the harness could trust the result.",
        `executor exit code: ${input.executorResult.exitCode ?? "unknown"}`,
        input.executorResult.stderr ? "executor stderr captured" : "executor stderr empty"
      ],
      artifacts: input.artifacts ?? []
    });
  }

  if (input.policy.summary.forbidden > 0) {
    return decision({
      action: input.checkpointMode === "git-worktree" ? "rollback" : "block",
      blocking: true,
      confidence: 0.96,
      reasons: [
        "Forbidden policy findings were detected in the diff.",
        `forbidden findings: ${input.policy.summary.forbidden}`,
        `policy fail-on: ${input.policy.failOn}`
      ],
      artifacts: input.artifacts ?? []
    });
  }

  const blockingGate = input.guardGates.gates.find((gate) => gate.status === "blocked");
  if (blockingGate) {
    return decision({
      action: decisionForGate(blockingGate.action, input.checkpointMode),
      blocking: true,
      confidence: 0.93,
      reasons: [
        `${blockingGate.guard} guard blocked: ${blockingGate.condition}.`,
        `guard: ${blockingGate.guard}`,
        `condition: ${blockingGate.condition}`,
        ...blockingGate.evidence.slice(0, 5)
      ],
      requiredCommands: commandForGate(blockingGate.action),
      artifacts: input.artifacts ?? []
    });
  }

  const needsContext = input.loop.decisions.find((item) => item.action === "rebuild-context" || item.action === "replan" || item.action === "expand-context");
  if (needsContext) {
    return decision({
      action: "repack",
      blocking: true,
      confidence: needsContext.confidence,
      reasons: ["The next loop needs refreshed or expanded context before continuing.", needsContext.reason, ...needsContext.signals],
      requiredCommands: needsContext.command ? [needsContext.command] : [],
      artifacts: input.artifacts ?? []
    });
  }

  const needsRepair = input.loop.decisions.find((item) => item.action === "repair-contracts" || item.action === "add-or-update-tests");
  const needsTests = input.loop.decisions.find((item) => item.action === "run-tests");
  if (needsTests) {
    return decision({
      action: "run-tests",
      blocking: true,
      confidence: needsTests.confidence,
      reasons: [needsTests.reason, ...needsTests.signals],
      requiredCommands: needsTests.command ? [needsTests.command] : [],
      artifacts: input.artifacts ?? []
    });
  }

  if (needsRepair || input.policy.summary.requiredMissing > 0) {
    return decision({
      action: "repair",
      blocking: true,
      confidence: needsRepair?.confidence ?? 0.88,
      reasons: [
        needsRepair?.reason ?? "Required policy evidence is missing.",
        ...(needsRepair?.signals ?? [`required missing: ${input.policy.summary.requiredMissing}`])
      ],
      requiredCommands: needsRepair?.command ? [needsRepair.command] : requiredCommandsFromPolicy(input.policy),
      artifacts: input.artifacts ?? []
    });
  }

  if (input.loop.risk === "High" || input.policy.summary.risks > 0) {
    return decision({
      action: "human-review",
      blocking: true,
      confidence: 0.82,
      reasons: [
        "The diff has high-impact or risk policy signals even though hard gates passed.",
        `impact risk: ${input.loop.risk}`,
        `policy risks: ${input.policy.summary.risks}`
      ],
      requiredCommands: [],
      artifacts: input.artifacts ?? []
    });
  }

  return decision({
    action: "finalize",
    blocking: false,
    confidence: input.changedFiles.length ? 0.8 : 0.72,
    reasons: [
      "No blocking policy, context, impact, or verification signals remain.",
      `changed files: ${input.changedFiles.length}`,
      `loop status: ${input.loop.status}`,
      "policy: passed"
    ],
    artifacts: input.artifacts ?? []
  });
}

export function maxLoopHarnessDecision(maxLoops: number, lastDecision: HarnessDecision): HarnessDecision {
  return decision({
    action: "human-review",
    blocking: true,
    confidence: 0.9,
    reasons: [
      `Maximum orchestrator loop count (${maxLoops}) reached before the harness could finalize.`,
      `max loops: ${maxLoops}`,
      `last action: ${lastDecision.action}`,
      ...lastDecision.reasons
    ],
    requiredCommands: lastDecision.requiredCommands,
    artifacts: lastDecision.artifacts
  });
}

export function noProgressHarnessDecision(fingerprint: string, lastDecision: HarnessDecision): HarnessDecision {
  return decision({
    action: "human-review",
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
    artifacts: lastDecision.artifacts
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
    artifacts: input.artifacts ?? []
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
