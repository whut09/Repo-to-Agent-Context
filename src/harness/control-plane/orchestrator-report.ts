import type { HarnessDecision } from "../types.js";
import { HARNESS_DECISION_PRIORITY } from "./decision-engine.js";
import { bullet, code, heading, table } from "../../outputs/renderers/markdown.js";
import type { HarnessOrchestratorReport } from "./orchestrator.js";
import type { InterventionStatus, InterventionSummary } from "../types.js";

const emptyInterventions: InterventionSummary = {
  total: 0,
  byStatus: Object.fromEntries(["observed", "prevented", "requested", "repaired", "verified", "unresolved", "human-review", "stale"].map((status) => [status, 0])) as Record<InterventionStatus, number>,
  active: [],
  verified: []
};

function decisionReason(decision: HarnessDecision): string {
  return decision.reasons[0] ?? decision.action;
}

function decisionPriority(decision: HarnessDecision): number {
  return HARNESS_DECISION_PRIORITY[decision.action];
}

export function renderOrchestratorReport(report: HarnessOrchestratorReport): string {
  const interventions = report.interventions ?? emptyInterventions;
  return [
    heading(1, "Harness Orchestrator"),
    "",
    `Task: ${report.task}`,
    `Task id: ${report.taskId}`,
    `Executor: ${report.executor}`,
    `Decision: ${report.decision.action}`,
    `Convergence: ${report.convergence.status}`,
    `Base: ${report.base}`,
    `Sandbox: ${report.sandbox.mode}${report.sandbox.discarded ? " (discarded)" : ""}`,
    "",
    heading(2, "Architecture Flow"),
    bullet(
      [
        "OpenCode++ plan / pack",
        `Executor: ${report.executor}`,
        "Agent execution",
        "Diff / trace / test evidence collection",
        "Policy / contracts / tests / impact / verify evaluation",
        `Decision: ${report.decision.action}`
      ].map((item) => item)
    ),
    "",
    heading(2, "Evidence Summary"),
    table(
      ["Question", "Answer"],
      [
        ["Which agent executed?", report.executor],
        ["Which files changed?", report.changedFiles.length ? report.changedFiles.map(code).join(", ") : "none"],
        ["Which executor command ran?", report.executorResult.command ? code(report.executorResult.command) : "none"],
        ["Where did the executor run?", report.sandbox.mode === "git-worktree" ? code(report.sandbox.root) : "host repository"],
        ["Normalized executor events", String(report.executorResult.normalizedEventsCount ?? 0)],
        ["Trusted test evidence", report.loop.trace.passedTestEvidence],
        ["Trace loaded", report.loop.trace.loaded ? "yes" : "no"],
        [
          "Boundary / contract check",
          `${report.loop.checks.contracts} (${report.loop.checks.contractViolations} violation${report.loop.checks.contractViolations === 1 ? "" : "s"})`
        ],
        ["Policy gate", report.policy.passed ? "passed" : "failed"],
        ["Blocking Guard gates", String(report.gates.summary.blocking)],
        ["Missing required evidence", String(report.policy.summary.requiredMissing)],
        ["Forbidden findings", String(report.policy.summary.forbidden)],
        ["Impact risk", report.loop.risk],
        ["Convergence", report.convergence.status],
        ["State fingerprint", code(report.convergence.fingerprint.value)],
        ["Selected decision candidate", report.decision.arbitration?.selectedCandidate.id ?? "legacy/direct decision"],
        ["Final decision", `${report.decision.action} - ${decisionReason(report.decision)}`]
      ]
    ),
    "",
    heading(2, "Intervention Ledger"),
    table(
      ["Status", "Count"],
      Object.entries(interventions.byStatus).map(([status, count]) => [status, String(count)])
    ),
    bullet(
      interventions.active.map((event) => `${event.status}: ${event.problem} (${event.action})${event.findingId ? ` [${event.findingId}]` : ""}`)
    ),
    "",
    heading(2, "Guard Gates"),
    table(
      ["Guard", "Condition", "Status", "Action"],
      report.gates.gates.map((gate) => [gate.guard, gate.condition, gate.status, gate.action])
    ),
    "",
    heading(2, "Sandbox"),
    table(
      ["Field", "Value"],
      [
        ["Mode", report.sandbox.mode],
        ["Root", code(report.sandbox.root)],
        ["Initial source patch applied", report.sandbox.initialPatch ? "yes" : "no"],
        ["Discarded after export", report.sandbox.discarded ? "yes" : "no"],
        ["Gateway", report.sandbox.gatewayDir ? code(report.sandbox.gatewayDir) : "none"],
        ["Gateway manifest", report.sandbox.manifestPath ? code(report.sandbox.manifestPath) : "none"],
        ["Patch", report.sandbox.patchPath ? code(report.sandbox.patchPath) : "none"],
        ["Apply command", report.sandbox.applyCommand ? code(report.sandbox.applyCommand) : "none"]
      ]
    ),
    "",
    heading(2, "Decision"),
    table(
      ["Field", "Value"],
      [
        ["Action", report.decision.action],
        ["Priority", String(decisionPriority(report.decision))],
        ["Blocking", report.decision.blocking ? "yes" : "no"],
        ["Confidence", report.decision.confidence.toFixed(2)],
        ["Reason", decisionReason(report.decision).replace(/\|/g, "\\|")],
        ["Required commands", report.decision.requiredCommands.length ? report.decision.requiredCommands.map(code).join(", ") : "none"]
      ]
    ),
    "",
    heading(2, "Decision Reasons"),
    bullet(report.decision.reasons),
    "",
    ...renderDecisionArbitration(report.decision),
    heading(2, "Convergence"),
    table(
      ["Field", "Value"],
      [
        ["Status", report.convergence.status],
        ["Stop", report.convergence.shouldStop ? "yes" : "no"],
        ["Stop reason", report.convergence.stopReason ?? "none"],
        ["Repeated", report.convergence.repeated ? "yes" : "no"],
        ["Fingerprint", code(report.convergence.fingerprint.value)],
        ["Previous fingerprint", report.convergence.previousFingerprint ? code(report.convergence.previousFingerprint) : "none"]
      ]
    ),
    "",
    heading(2, "Loop Iterations"),
    table(
      ["Loop", "Decision", "Convergence", "Context", "Builds", "Build ms", "Cache", "Fingerprint", "Exit", "Changed files", "Directory"],
      report.iterations.map((iteration) => [
        String(iteration.index),
        iteration.decision.action,
        iteration.convergence.status,
        iteration.contextRefresh?.mode ?? "unknown",
        String(iteration.contextRefresh?.buildCount ?? 0),
        (iteration.contextRefresh?.durationMs ?? 0).toFixed(1),
        iteration.contextRefresh ? `${iteration.contextRefresh.cacheHits}/${iteration.contextRefresh.cacheMisses}` : "unknown",
        code(iteration.convergence.fingerprint.value.slice(0, 12)),
        String(iteration.executorResult.exitCode ?? "unknown"),
        String(iteration.changedFiles.length),
        code(iteration.dir)
      ])
    ),
    "",
    heading(2, "Executor Result"),
    table(
      ["Field", "Value"],
      [
        ["Exit code", String(report.executorResult.exitCode ?? "unknown")],
        ["Command", report.executorResult.command ? code(report.executorResult.command) : "none"],
        ["Events", report.executorResult.eventsPath ? code(report.executorResult.eventsPath) : "none"],
        ["Diff", report.executorResult.diffPath ? code(report.executorResult.diffPath) : "none"]
      ]
    ),
    "",
    heading(2, "Changed Files"),
    bullet(report.changedFiles.map(code)),
    "",
    heading(2, "Policy Summary"),
    table(
      ["Signal", "Count"],
      [
        ["Passed", report.policy.passed ? "yes" : "no"],
        ["Fail on", report.policy.failOn],
        ["Forbidden", String(report.policy.summary.forbidden)],
        ["Required missing", String(report.policy.summary.requiredMissing)],
        ["Risks", String(report.policy.summary.risks)],
        ["Required satisfied", String(report.policy.summary.requiredSatisfied)]
      ]
    ),
    "",
    heading(2, "Loop Decisions"),
    bullet(report.loop.decisions.map((decision) => `${decision.action}: ${decision.reason}`)),
    "",
    heading(2, "Artifacts"),
    bullet(
      [
        ...report.artifacts.orchestratorFiles,
        ...report.artifacts.iterationFiles,
        report.artifacts.checkpointFile ? report.artifacts.checkpointFile : "",
        report.artifacts.sandboxGatewayManifest ? report.artifacts.sandboxGatewayManifest : "",
        report.artifacts.sandboxPatchFile ? report.artifacts.sandboxPatchFile : "",
        report.artifacts.memoryCandidateFile ? report.artifacts.memoryCandidateFile : "",
        report.artifacts.stateFile ? report.artifacts.stateFile : ""
      ]
        .filter(Boolean)
        .map(code)
    )
  ].join("\n");
}

function renderDecisionArbitration(decision: HarnessDecision): string[] {
  const arbitration = decision.arbitration;
  if (!arbitration) return [];
  return [
    heading(2, "Decision Arbitration"),
    table(
      ["Field", "Value"],
      [
        ["Selected candidate", arbitration.selectedCandidate.id],
        ["Selected source", arbitration.selectedCandidate.source],
        ["Selected action", arbitration.selectedCandidate.action],
        ["Selected priority", String(arbitration.selectedPriority)],
        ["Supporting candidates", String(arbitration.supportingCandidates.length)]
      ]
    ),
    "",
    heading(3, "Supporting Candidates"),
    table(
      ["Candidate", "Source", "Action", "Priority", "Reason"],
      arbitration.supportingCandidates.map((candidate) => [
        candidate.id,
        candidate.source,
        candidate.action,
        String(candidate.priority),
        (candidate.reasons[0] ?? "none").replace(/\|/g, "\\|")
      ])
    ),
    ""
  ];
}
