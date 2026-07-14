import path from "node:path";
import type { HarnessDecision } from "../../types.js";

export interface PlanPhaseInput {
  runDir: string;
  iteration: number;
  previousDecision?: HarnessDecision;
}

export interface PlanPhaseOutput {
  iterationDir: string;
  refreshContext: boolean;
}

export function runPlanPhase(input: PlanPhaseInput): PlanPhaseOutput {
  return {
    iterationDir: path.join(input.runDir, "iterations", String(input.iteration).padStart(3, "0")),
    refreshContext: input.previousDecision?.action === "repack"
  };
}
